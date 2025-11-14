import {
  Duration,
  aws_cognito as cognito,
} from 'aws-cdk-lib'
import { Construct } from "constructs"
import { DeployEnvEnum, commonConstants, envConstants, resolveConfig } from "../../../parameters"
import * as fs from 'fs';

type CognitoAuthenticationProps = {
  deployEnv: DeployEnvEnum
}

export class CognitoAuthentication extends Construct {
  public readonly userPool: cognito.UserPool
  public readonly userPoolClient: cognito.UserPoolClient
  public readonly userPoolDomain: cognito.UserPoolDomain

  constructor(scope: Construct, id: string, props: CognitoAuthenticationProps) {
    super(scope, id);
    const { deployEnv } = props
    const config = resolveConfig();
    const providerName = `${config.authenMethod}-${deployEnv}`

    this.userPool = new cognito.UserPool(this, 'user-pool', {
      userPoolName: `${commonConstants.project}-${deployEnv}-user-pool`,
      selfSignUpEnabled: false,
    })
    
    // SAML IdP will be decide based of env setting
    if (config.authenMethod == "google") {
      const googleMetadata = fs.readFileSync(`GoogleIDPMetadata-${deployEnv}.xml`, 'utf8');

      const samlProvider = new cognito.UserPoolIdentityProviderSaml(this, 'google-saml-provider', {
        userPool: this.userPool,
        name: providerName,
        metadata: cognito.UserPoolIdentityProviderSamlMetadata.file(googleMetadata),
        idpInitiated: true
      })
    } else if (config.authenMethod == "aws") {
      const ssoMetadataUrl = envConstants[deployEnv].iamIcMetadataUrl
      const samlProvider = new cognito.UserPoolIdentityProviderSaml(this, 'google-saml-provider', {
        userPool: this.userPool,
        name: providerName,
        metadata: cognito.UserPoolIdentityProviderSamlMetadata.url(ssoMetadataUrl),
        idpInitiated: true
      })
    }

    this.userPoolClient = new cognito.UserPoolClient(this, 'user-pool-client', {
      userPool: this.userPool,
      userPoolClientName: `${commonConstants.project}-${deployEnv}-user-pool-client`,
      generateSecret: false,

      // OAuth configuration
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
          cognito.OAuthScope.COGNITO_ADMIN,
          cognito.OAuthScope.PHONE,
        ],
        callbackUrls: [`https://${envConstants[deployEnv].domain}/parseauth`],
        logoutUrls: [`https://${envConstants[deployEnv].domain}/signedout`],
      },

      // Supported identity providers
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.custom(providerName),
      ],

      // Token validity
      authFlows: {
        userSrp: true,
        custom: true
      },
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    })

    // Create User Pool Domain
    this.userPoolDomain = this.userPool.addDomain('user-pool-domain', {
      cognitoDomain: {
        domainPrefix: `${commonConstants.project}-${deployEnv}-sso-auth`,
      },
    })
  }
}
