import {
  aws_route53 as route53,
  aws_apigateway as apigw,
  aws_certificatemanager as certificatemanager,
  aws_lambda as lambda,
  aws_route53_targets as route53_targets,
  aws_cognito as cognito,
  Duration
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DeployEnvEnum, envConstants, commonConstants } from '../../../parameters';

interface HttpApiProps {
  deployEnv: DeployEnvEnum
  hostedZone: route53.HostedZone
  userPool: cognito.UserPool
  userPoolClient: cognito.UserPoolClient
};

export class HttpApi extends Construct {
  constructor(scope: Construct, id: string, props: HttpApiProps) {
    super(scope, id)

    const { deployEnv, hostedZone, userPool, userPoolClient } = props

    const defaultLambdaFn = new lambda.Function(this, `default-fn-${deployEnv}`, {
      functionName: `default-fn-${deployEnv}`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'health.handler',
      code: lambda.Code.fromAsset('assets/lambda-code.py'),
      timeout: Duration.minutes(2),
    });

    const authorizer = new apigw.CognitoUserPoolsAuthorizer(this, 'cognito-authorizer', {
      cognitoUserPools: [userPool],
      authorizerName: `CognitoAuthorizer${deployEnv}`,
    });

    const apigatewayCert = new certificatemanager.Certificate(this, 'apigateway-cert', {
      domainName: envConstants[deployEnv].apiDomain,
      validation: certificatemanager.CertificateValidation.fromDns(hostedZone),
    })

    const restApi = new apigw.LambdaRestApi(this, 'lambda-rest-api', {
      handler: defaultLambdaFn,
      restApiName: `${commonConstants.project}-${deployEnv}-http-api`,
      description: 'API Gateway Rest Api with Cognito authentication',
      domainName:{
        domainName: envConstants[deployEnv].apiDomain,
        certificate: apigatewayCert
      },
      proxy: false,
      defaultCorsPreflightOptions: {
        allowHeaders: ['Authorization', '*'],
        allowMethods: apigw.Cors.ALL_METHODS,
        allowOrigins: [`https://${envConstants[deployEnv].domain}`],
        maxAge: Duration.days(1),
      },
      endpointTypes: [apigw.EndpointType.REGIONAL],
    })
    // add routes
    // catch-all OPTIONS route (no authorizer)
    // httpApi.addRoutes({
    //   path: '/{proxy+}',
    //   methods: [apigatewayv2.HttpMethod.OPTIONS],
    //   integration: apiLambdaIntegration,
    // })
    // catch-all path for everything else `/*`


    // =================================================
    // A record
    // =================================================
    new route53.ARecord(this, 'alias-record', {
      zone: hostedZone,
      recordName: envConstants[deployEnv].apiDomain,
      target: route53.RecordTarget.fromAlias(
        new route53_targets.ApiGateway(restApi),
      ),
    })
  }
}
