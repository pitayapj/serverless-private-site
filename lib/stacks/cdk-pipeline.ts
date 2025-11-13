import {
  pipelines as cdkpipeline,
  Stack,
  StackProps,
  aws_iam as iam,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { commonConstants, resolveConfig, DeployEnvEnum } from '../parameters';
import { AppStage } from '../stages/app-stage';

interface CDKPipelineStackProps extends StackProps {
  infraStatus: "on" | "off",
}

export class CdkPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: CDKPipelineStackProps) {
    super(scope, id, props);

    const { infraStatus } = props;

    const config = resolveConfig();
    // Development Environment
    const devStage = new AppStage(this, `dev`, {
      env: { account: config.awsAccount, region: config.region },
      deployEnv: DeployEnvEnum.DEV,
      infraStatus: infraStatus,
    });

    // Staging Environment
    const stgStage = new AppStage(this, `stg`, {
      env: { account: config.awsAccount, region: config.region },
      deployEnv: DeployEnvEnum.STG,
      infraStatus: 'on',
    });

    // Production Environment
    const prodStage = new AppStage(this, `prod`, {
      env: { account: config.awsAccount, region: config.region },
      deployEnv: DeployEnvEnum.PROD,
      infraStatus: 'on',
    });

    const cdkPipeline = new cdkpipeline.CodePipeline(this, `${commonConstants.project}-cdk-pipeline`, {
      synth: new cdkpipeline.CodeBuildStep(`project-synth`, {
        input: cdkpipeline.CodePipelineSource.connection(config.infraRepo, 'main', {
          connectionArn: config.githubConnection
        }),
        commands: [
          `aws ssm get-parameter --with-decryption --name /cdk/env --output text --query 'Parameter.Value' > .env`,
          'npm ci', 'npm run build', 'npx cdk synth',
          'pip3 install ansi2html',
          `{ echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')" ; FORCE_COLOR=1 npx cdk diff "CDKPipelineStack/stg/**" 2>&1; } | ansi2html > cdk-diff-output-stg.html`,
          `{ echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')" ; FORCE_COLOR=1 npx cdk diff "CDKPipelineStack/prod/**" 2>&1; } | ansi2html > cdk-diff-output-prod.html`,
        ],
        rolePolicyStatements: [
          new iam.PolicyStatement({
            resources: [
              `arn:aws:ssm:${this.region}:${this.account}:parameter/cdk/env`
            ],
            actions: ["ssm:GetParameter*"],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'cloudformation:DescribeStacks',
              'cloudformation:GetTemplate',
              'cloudformation:ListStacks',
              'cloudformation:DescribeStackEvents',
              'cloudformation:DescribeStackResource',
              'cloudformation:DescribeStackResources',
              'cloudformation:GetTemplateSummary',
              's3:ListBucket',
              's3:GetObject',
              's3:PutObject',
              'ecr:DescribeRepositories',
              'ecr:ListImages',
              'ecr:BatchGetImage',
              'ecr:GetDownloadUrlForLayer',
              'sts:AssumeRole'
            ],
            resources: ['*']
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'iam:GetRole',
              'iam:GetRolePolicy',
              'iam:ListRolePolicies',
              'iam:ListAttachedRolePolicies'
            ],
            resources: ['*']
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'ssm:GetParameter',
              'ssm:GetParameters'
            ],
            resources: ['*']
          })
        ],
      }),
    });

    cdkPipeline.addStage(devStage);

    cdkPipeline.addStage(stgStage);

    cdkPipeline.addStage(prodStage, {
      pre: [new cdkpipeline.ManualApprovalStep('production-deployment-approval', {
        comment: 'Please approve the deployment to production.',
        reviewUrl: "https://pitayapj.github.io"
      })],
    });

  }
}