/**
 * Stateless resources. 
 * Load Balancer, Compute Resources, Deploy Pipelines, Lambda functions.
 * Security Groups, IAM permissions.
 */

import {
  Stack,
  StackProps,
  RemovalPolicy,
  Duration,
  aws_ec2 as ec2,
  aws_lambda as lambda,
  aws_s3 as s3,
  aws_route53 as route53,
  aws_route53_targets as route53_targets,
  aws_elasticloadbalancingv2 as lbv2,
  aws_ecs as ecs,
  aws_logs as logs,
  aws_iam as iam,
  aws_codepipeline as codepipeline,
  aws_codepipeline_actions as codepipeline_actions,
  aws_codebuild as codebuild,
  aws_codedeploy as codedeploy,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as cloudfront_origins,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { envConstants, commonConstants, resolveConfig, DeployEnvEnum } from '../parameters';
import { 
  ContainerServiceConstruct, 
  CertificatesConstruct,
  CloudfrontLoadBalancerConstruct
} from '../constructs/stateless';
import * as path from 'path';


interface StatelessResourceProps extends StackProps {
  deployEnv: DeployEnvEnum,
  vpc: ec2.Vpc;
  hostZone: route53.HostedZone;
}

export class StatelessResourceStack extends Stack {
  constructor(scope: Construct, id: string, props: StatelessResourceProps) {
    super(scope, id, props);
    const { deployEnv, vpc, hostZone } = props;
    const config = resolveConfig();
    /**
     * Log bucket (in early stage of development, maybe it's best to set DESTROY RemovalPolicy)
     */
    const loggingBucket = new s3.Bucket(this, `logging-bucket-${deployEnv}`, {
      bucketName: `${commonConstants.project}-logging-bucket`,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER
    });
    loggingBucket.applyRemovalPolicy(RemovalPolicy.DESTROY);


    const certConstruct = new CertificatesConstruct(this, 'certificates-construct', { 
      deployEnv: deployEnv,
      hostZone: hostZone
    });
    
    const cloudfrontLoadBalancerConstruct = new CloudfrontLoadBalancerConstruct(this, 'load-balancer-construct', {
      deployEnv: deployEnv,
      hostZone: hostZone,
      lbCert: certConstruct.lbCert,
      cloudfrontCert: certConstruct.cloudfrontCert,
      vpc: vpc,
      loggingBucket: loggingBucket,
      supportBackendDomains: [envConstants[deployEnv].apiDomain] //write all domain will go to load balance here
    });


    /**
     * Compute Resource (ECS)
     */
    //Cluster
    const cluster = new ecs.Cluster(this, `${deployEnv}-cluster`, {
      vpc: vpc,
      clusterName: `${deployEnv}-${commonConstants.project}-cluster`
    });

    /**
     * With each service, we will have to declare below setting
     */
    //API Service Policy
    const apiCustomPermission = [
      new iam.PolicyStatement({
        actions: ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
        resources: [`*`]
      })
    ];

    const apiSecret = {
        // DB_PORT: ecs.Secret.fromSsmParameter(ssm.StringParameter.fromStringParameterAttributes(this, "port_value", { parameterName: `/${deployEnv}/db_port` })),
        // DB_USERNAME: ecs.Secret.fromSsmParameter(ssm.StringParameter.fromStringParameterAttributes(this, "username_value", { parameterName: `/${deployEnv}/db_username` })),
        // DB_PASSWORD: ecs.Secret.fromSsmParameter(ssm.StringParameter.fromStringParameterAttributes(this, "password_value", { parameterName: `/${deployEnv}/db_password` })),
        // DB_DATABASE: ecs.Secret.fromSsmParameter(ssm.StringParameter.fromStringParameterAttributes(this, "db_value", { parameterName: `/${deployEnv}/db_database` })),
    }

    const apiService = new ContainerServiceConstruct(this, 'api-service-construct', { 
      deployEnv: deployEnv,
      serviceName: "api",
      serviceDomain: envConstants[deployEnv].apiDomain,
      loadBalancer: cloudfrontLoadBalancerConstruct.loadBalancer,
      httpsListener: cloudfrontLoadBalancerConstruct.httpsListener,
      albPriority: 1,
      port: 8888,
      secrets: apiSecret,
      cluster: cluster,
      customPolicies: apiCustomPermission,
      vpc: vpc,
      healthCheckPath: "/health",
    });


    /**
     * Cloudfront Distributions
     */

    /**
     * Deploy Pipeline
     */
    //Codebuild permission 
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

    /**Lambda function */
    const invalidationLambda = new lambda.Function(this, `${deployEnv}-${commonConstants.project}-invalidate-lambda`, {
      functionName: `cloudfront-invalidation-${deployEnv}`,
      code: lambda.Code.fromAsset(path.join(__dirname, "../../assets")),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: `invalidation.lambda_handler`,
      environment: {
        "env": deployEnv
      },
    });
    invalidationLambda.addToRolePolicy(new iam.PolicyStatement({
      resources: ["*"],
      actions: ["cloudfront:CreateInvalidation"],
    }));
  }
}
