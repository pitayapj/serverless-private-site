import { Construct } from "constructs";
import {
    aws_codebuild as codebuild,
    aws_codepipeline as codepipeline,
    aws_codepipeline_actions as codepipeline_actions,
    aws_ecs as ecs,
    aws_iam as iam,
    aws_ecr as ecr,
    aws_ec2 as ec2,
    Duration,
} from 'aws-cdk-lib';
import { DeployEnvEnum } from "../../parameters";

interface ECSPipelineConstructProps {
    deployEnv: DeployEnvEnum
    ecrRepo: ecr.Repository
    ecsService: ecs.FargateService
    containerName: string
    repositoryName: string
    codeBranch: string
    githubConnection: string
    vpc?: ec2.Vpc
}

export class ECSPipelineConstruct extends Construct {
    constructor(scope: Construct, id: string, props: ECSPipelineConstructProps) {
        super(scope, id);

        const {
            deployEnv,
            ecrRepo,
            ecsService,
            containerName,
            repositoryName,
            codeBranch,
            githubConnection,
            vpc
        } = props

        /**
         * Deployment pipeline for ECS Service with Blue/Green Deployment
         * */
        const sourceOutput = new codepipeline.Artifact();
        const sourceAction = new codepipeline_actions.CodeStarConnectionsSourceAction({
            actionName: "GithubSource",
            owner: "long2205",
            branch: codeBranch,
            repo: "ecs-example-api-repo",
            output: sourceOutput,
            connectionArn: githubConnection,
            codeBuildCloneOutput: true
        });
        //Build
        const codebuildRole = new iam.Role(this, `codebuild-role-${deployEnv}`, {
            assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
        });

        codebuildRole.addToPolicy(new iam.PolicyStatement({
            resources: ["*"],
            actions: ["ecr:*", "ssm:GetParameters", "ecs:UpdateService", "ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition", "ecs:TagResource"],
        }));

        codebuildRole.addToPolicy(new iam.PolicyStatement({
            resources: ["*"],
            actions: ["iam:PassRole"],
        }));
        const buildOutput = new codepipeline.Artifact();
        const buildProject = new codebuild.Project(this, "BuildProject", {
            projectName: `${ecsService.serviceName}-build-${deployEnv}`,
            role: codebuildRole,
            buildSpec: codebuild.BuildSpec.fromObject({
                version: "0.2",
                phases: {
                    pre_build: {
                        commands: [
                            "echo Logging in to Amazon ECR...",
                            "aws --version",
                            "aws ecr get-login-password | docker login --username AWS --password-stdin " + ecrRepo.repositoryUri,
                            `aws ssm get-parameter --with-decryption --name /${deployEnv}/${ecsService.serviceName}/env --output text --query 'Parameter.Value' > .env`,
                            "echo 'Check for migration changes'",
                            "CHANGED_FILES=$(git diff --name-only HEAD^ HEAD -- app/src/models)",
                            `export MIGRATION=$([ -n "$CHANGED_FILES" ] && echo true || echo false)`,
                            "echo $MIGRATION",
                        ]
                    },
                    build: {
                        commands: [
                            "echo Build started on `date`",
                            'docker build -t ' + ecrRepo.repositoryUri + ':$COMMIT_ID .',
                            'docker image tag ' + ecrRepo.repositoryUri + ':$COMMIT_ID ' + ecrRepo.repositoryUri + ':latest',
                        ]
                    },
                    post_build: {
                        commands: [
                            "echo Build completed on `date`",
                            "echo Pushing the Docker image...",
                            'docker push ' + ecrRepo.repositoryUri + ':$COMMIT_ID',
                            'docker push ' + ecrRepo.repositoryUri + ':latest',
                            `printf '[{"name": "${containerName}","imageUri":"${ecrRepo.repositoryUri}:latest"}]' > imagedefinitions.json`,
                        ],
                    }
                },
                artifacts: {
                    files: [
                        "imagedefinitions.json"
                    ]
                },
                env: {
                    "exported-variables": [
                        "MIGRATION"
                    ],
                    "git-credential-helper": "yes"
                }
            }),
            environment: {
                buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
                privileged: true,
            },
        });
        //Migration 
        const runMigrationBuild = new codebuild.Project(this, "runMigrationBuild", {
            projectName: `run-migration-${deployEnv}`,
            environment: {
                buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
                privileged: true,
            },
            role: codebuildRole,
            vpc: vpc,
            subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            buildSpec: codebuild.BuildSpec.fromObject({
                version: "0.2",
                phases: {
                    pre_build: {
                        commands: [
                            "echo Reading image URI from imageDetail.json...",
                            "IMAGE_URI=$(jq -r '.[0].imageUri' imagedefinitions.json)",
                            "echo Logging in to Amazon ECR...",
                            "AWS_ACCOUNT_ID=$(echo ${CODEBUILD_BUILD_ARN} | cut -f 5 -d :)",
                            "aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com",
                            `docker pull $IMAGE_URI`, // Pull image using URI from imageDetail.json
                        ]
                    },
                    build: {
                        commands: [
                            "echo Running migration...",
                            `docker run --rm --env-file <(env) $IMAGE_URI npm run migrate` // Replace with your migration command
                        ]
                    },
                },
            }),
            environmentVariables: {
                // MYSQL_DB_HOST: { value: dbHost.stringValue },
                // MYSQL_DB_PORT: { value: dbPort.stringValue },
                // MYSQL_DB_USERNAME: { value: dbUsername.stringValue },
                // MYSQL_DB_PASSWORD: { value: dbPassword.stringValue },
                // MYSQL_DB_DATABASE: { value: dbDatabase.stringValue },
            }

        });

        const pipeline = new codepipeline.Pipeline(this, "Pipeline", {
            pipelineName: `${ecsService.serviceName}-pipeline-${deployEnv}`,
            stages: [
                {
                    stageName: "Source",
                    actions: [sourceAction],
                },
                {
                    stageName: "Build",
                    actions: [
                        new codepipeline_actions.CodeBuildAction({
                            actionName: "DockerImageLaravel",
                            project: buildProject,
                            input: sourceOutput,
                            outputs: [buildOutput],
                        }),
                    ],
                },
                {
                    stageName: "Deploy",
                    actions: [
                        new codepipeline_actions.EcsDeployAction({
                            actionName: "ECS_BlueGreen_Deploy",
                            service: ecsService,
                            input: buildOutput,
                            deploymentTimeout: Duration.minutes(10),
                        }),
                    ],
                },
            ],
            crossAccountKeys: false,
        });
        if (vpc != undefined) {
            pipeline.addStage(
                {
                    stageName: "Migration",
                    beforeEntry: {
                        conditions: [
                            {
                                result: codepipeline.Result.SKIP,
                                rules: [
                                    new codepipeline.Rule({
                                        name: "Check_Migration",
                                        provider: "VariableCheck",
                                        version: "1",
                                        configuration: {
                                            Variable: "#{BuildImage.MIGRATION}",
                                            Value: "true",
                                            Operator: "EQ"
                                        },
                                    })
                                ],
                            }
                        ]
                    },
                    actions: [
                        new codepipeline_actions.CodeBuildAction({
                            actionName: "Run_Migration",
                            project: runMigrationBuild,
                            input: buildOutput, // Pass build output with imagedefinitions.json
                        }),
                    ],
                    placement: {
                        justAfter: pipeline.stage("Build")
                    }
                },
            )
        }
    }
}
