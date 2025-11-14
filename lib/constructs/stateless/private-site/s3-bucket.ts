import { Construct } from "constructs";
import {
  aws_s3 as s3,
  aws_cloudfront as cloudfront,
} from 'aws-cdk-lib';
import { envConstants, DeployEnvEnum, commonConstants } from '../../../parameters'

interface S3BucketConstructProps {
  deployEnv: DeployEnvEnum
}

export class S3BucketConstruct extends Construct {
  public readonly frontendOai: cloudfront.OriginAccessIdentity
  public readonly frontendBucket: s3.Bucket
  public readonly loggingBucket: s3.Bucket
  constructor(scope: Construct, id: string, props: S3BucketConstructProps) {
    super(scope, id);

    const { deployEnv } = props
    // buckets
    this.frontendBucket = new s3.Bucket(this, 'frontend-bucket', {
      bucketName: envConstants[deployEnv].domain,
      accessControl: s3.BucketAccessControl.PRIVATE,
    })
    // Create Origin Access Identity
    this.frontendOai = new cloudfront.OriginAccessIdentity(this, 'oai', {
      comment: `OAI for ${envConstants[deployEnv].domain} in ${deployEnv}`
    });
    
    // Grant OAI read access to the bucket
    this.frontendBucket.grantRead(this.frontendOai);

    this.loggingBucket = new s3.Bucket(this, 'logging-bucket', {
      bucketName: `logging-${commonConstants.project}-${deployEnv}`,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER
    })

    const lambdaCodeBucket = new s3.Bucket(this, 'lambda-code-bucket', {
      bucketName: `lambda-${commonConstants.project}-${deployEnv}`,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER
    })
  }
}
