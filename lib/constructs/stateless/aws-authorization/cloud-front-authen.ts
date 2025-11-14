import {
    aws_cloudfront as cloudfront,
    aws_cognito as cognito,
    Fn,
} from 'aws-cdk-lib';
import { aws_sam as sam } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DeployEnvEnum, envConstants, resolveConfig } from '../../../parameters';

interface CloudFrontAuthAtEdgeConstructProps {
  deployEnv: DeployEnvEnum
  frontendOai: cloudfront.OriginAccessIdentity
  userPool: cognito.UserPool,
  userPoolClient: cognito.UserPoolClient,
  userPoolDomain: cognito.UserPoolDomain,
}

export class CloudFrontAuthAtEdgeConstruct extends Construct {
  public readonly parseAuthLambdaArn: string;
  public readonly refreshAuthLambdaArn: string
  public readonly signOutLambdaArn: string;
  public readonly checkAuthLambdaArn: string
  public readonly httpHeadersLambdaArn: string
  
  constructor(scope: Construct, id: string, props: CloudFrontAuthAtEdgeConstructProps) {
    super(scope, id);

    const { deployEnv, frontendOai, userPool, userPoolClient, userPoolDomain } = props
    const config = resolveConfig();
    // 🚀 Deploy preconfigured "CloudFront Authorization@Edge" application
    const app = new sam.CfnApplication(this, 'CloudFrontAuthorizationAtEdge', {
      location: {
        applicationId:
          'arn:aws:serverlessrepo:us-east-1:520945424137:applications/cloudfront-authorization-at-edge',
        semanticVersion: '2.3.2',
      },
      parameters: {
        // 🔹 Optional Parameters (uncomment or set values as needed)
        OriginAccessIdentity: frontendOai.originAccessIdentityId,
        UserPoolArn: userPool.userPoolArn,
        UserPoolClientId: userPoolClient.userPoolClientId,
        UserPoolAuthDomain: userPoolDomain.domainName + '.auth.' + config.region + '.amazoncognito.com',
        RedirectPathSignOut: '/',
        RedirectPathSignIn: '/parseauth',
        SignOutUrl: '/signout',
        OAuthScopes: 'phone,email,profile,openid,aws.cognito.signin.user.admin',
        // 🔹 Optional: custom security headers
        HttpHeaders: JSON.stringify({
          'Content-Security-Policy':
            "default-src 'none'; img-src 'self'; script-src 'self' https://code.jquery.com https://stackpath.bootstrapcdn.com; style-src 'self' 'unsafe-inline' https://stackpath.bootstrapcdn.com; object-src 'none'; connect-src 'self' https://*.amazonaws.com https://*.amazoncognito.com https://" + envConstants[deployEnv].apiDomain,
          'Strict-Transport-Security': 'max-age=31536000; includeSubdomains; preload',
          'Referrer-Policy': 'same-origin',
          'X-XSS-Protection': '1; mode=block',
          'X-Frame-Options': 'DENY',
          'X-Content-Type-Options': 'nosniff',
        }),
        // 🔹 You can set this false if you only want Lambda@Edge functions
        CreateCloudFrontDistribution: 'false',
      },
    });

    this.checkAuthLambdaArn = Fn.getAtt(app.logicalId, 'Outputs.CheckAuthHandler').toString();
    this.parseAuthLambdaArn = Fn.getAtt(app.logicalId, 'Outputs.ParseAuthHandler').toString();
    this.refreshAuthLambdaArn = Fn.getAtt(app.logicalId, 'Outputs.RefreshAuthHandler').toString();
    this.signOutLambdaArn = Fn.getAtt(app.logicalId, 'Outputs.SignOutHandler').toString();
    this.httpHeadersLambdaArn = Fn.getAtt(app.logicalId, 'Outputs.HttpHeadersHandler').toString();

  }
}
