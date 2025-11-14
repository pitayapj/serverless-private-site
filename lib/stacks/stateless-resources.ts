/**
 * Stateless resources. 
 * Load Balancer, Compute Resources, Deploy Pipelines, Lambda functions.
 * Security Groups, IAM permissions.
 */

import {
  Stack,
  StackProps,
  RemovalPolicy,
  aws_lambda as lambda,
  aws_s3 as s3,
  aws_route53 as route53,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {  commonConstants, resolveConfig, DeployEnvEnum } from '../parameters';
import { 
  CertificatesConstruct,
  CognitoAuthentication, 
  FrontendConstruct,
  HttpApi,
  S3BucketConstruct,
} from '../constructs/stateless/private-site';
import { CloudFrontAuthAtEdgeConstruct } from '../constructs/stateless/aws-authorization'


interface StatelessResourceProps extends StackProps {
  deployEnv: DeployEnvEnum,
  // vpc: ec2.Vpc;
  hostZone: route53.HostedZone;
}

export class StatelessResourceStack extends Stack {
  constructor(scope: Construct, id: string, props: StatelessResourceProps) {
    super(scope, id, props);
    const { deployEnv, hostZone } = props;
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
    
    const cognitoAuthentication = new CognitoAuthentication(this, 'cognito-authentication', {
      deployEnv: deployEnv,
    });
    
    const s3Buckets = new S3BucketConstruct(this, 's3-buckets', {
      deployEnv: deployEnv,
    });

    const preConfiguredAutheApp = new CloudFrontAuthAtEdgeConstruct(this, 'cloud-front-authen', {
      deployEnv: deployEnv,
      frontendOai: s3Buckets.frontendOai,
      userPool: cognitoAuthentication.userPool,
      userPoolClient: cognitoAuthentication.userPoolClient,
      userPoolDomain: cognitoAuthentication.userPoolDomain,
    });

    const frontendConstruct = new FrontendConstruct(this, 'frontend', {
      deployEnv: deployEnv,
      hostedZone: hostZone,
      frontendBucket: s3Buckets.frontendBucket,
      loggingBucket: s3Buckets.loggingBucket,
      frontendOai: s3Buckets.frontendOai,
      parseAuthLambdaArn: preConfiguredAutheApp.parseAuthLambdaArn,
      refreshAuthLambdaArn: preConfiguredAutheApp.refreshAuthLambdaArn,
      signOutLambdaArn: preConfiguredAutheApp.signOutLambdaArn,
      checkAuthLambdaArn: preConfiguredAutheApp.checkAuthLambdaArn,
      httpHeadersLambdaArn: preConfiguredAutheApp.httpHeadersLambdaArn,
    })
    // Optional adding backend
    // new HttpApi(this, 'http-api', {
    //   deployEnv: deployEnv,
    //   hostedZone: hostZone,
    //   userPool: cognitoAuthentication.userPool,
    //   userPoolClient: cognitoAuthentication.userPoolClient,
    // });
  }
}
