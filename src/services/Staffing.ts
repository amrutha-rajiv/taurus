import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Subject } from 'rxjs/Subject';
import { RestCredentials, StaffingAuthProvider } from './StaffingAuthProvider';
import { StaffingConfiguration } from '../types';
import { Cache, QueryString } from '../utils';

const getCookie = (cname: string) => {
    if (document) {
        const name = `${cname}=`;
        const ca = document.cookie.split(';');
        for (let c of ca) {
            while (c.charAt(0) === ' ') {
                c = c.substring(1);
            }
            if (c.indexOf(name) === 0) {
                return c.substring(name.length, c.length);
            }
        }
    }
    return false;
};

/**
 * Used to authenticate with Bullhorn OAuth Service and track session.
 * @param config - object used to configure you bullhorn service
 * @param [config.authUrl] URL to be used for Authentication
 * @param [config.callbackUrl] URL to return to after authentication defaults to window.location
 * @param [config.clientId] Bullhorn Client ID provided by the developer center.
 * @param [config.clientSecret] Bullhorn Client Secret provided by the developer center.
 * @param [config.apiVersion] API Version to target, defaults '*' (latest)
 * @example
 * ```
 * let conn = new Staffing({
 *      BhRestToken: '~BULLHORN_REST_TOKEN~',
 *      restUrl: '~BULLHORN_REST_ENDPOING~',
 * });
 * ```
 */
export class Staffing {
    public static unauthorized: Subject<any> = new Subject();
    private static readonly _http: AxiosInstance = axios.create({
        paramsSerializer: params => {
            return QueryString.stringify(params);
        }
    });
    public useCookies: boolean = false;
    public accessToken: string;

    public config: StaffingConfiguration = {
        client_id: 'UNDEFINED',
        client_secret: 'UNDEFINED',
        authorization_url: 'https://auth.bullhornstaffing.com/oauth/authorize',
        token_url: 'https://auth.bullhornstaffing.com/oauth/token',
        login_url: 'https://rest.bullhornstaffing.com/rest-services/login',
        redirect_url: 'https://localhost:3000',
        apiVersion: '*',
        useCookies: false
    };

    constructor(private readonly options: StaffingConfiguration = {}) {
        this.config = { ...this.config, ...this.options };
        this.useCookies = options.useCookies || false;
        if (this.options.BhRestToken) {
            Cache.put('BhRestToken', this.config.BhRestToken);
        } else {
            this.useCookies = true;
        }
        if (this.options.restUrl) {
            Cache.put('restUrl', this.config.restUrl);
        }
    }

    async login(provider: StaffingAuthProvider): Promise<RestCredentials> {
        return provider.credential(this.config).then((credentials: RestCredentials) => {
            Cache.put('BhRestToken', credentials.BhRestToken);
            Cache.put('restUrl', credentials.restUrl);
            return credentials;
        });
    }

    async isLoggedIn(): Promise<AxiosResponse> {
        return this.ping();
    }
    /**
     * Retrieves the HttpService created to connect to the Bullhorn RestApi
     */
    static http(): AxiosInstance {
        const cookie = getCookie('UL_identity');
        if (cookie && cookie.length) {
            const identity = JSON.parse(JSON.parse(cookie));
            const endpoints = identity.sessions.reduce((obj, session) => {
                obj[session.name] = session.value.endpoint;
                return obj;
            }, {});
            Staffing._http.defaults.baseURL = endpoints.rest;
            Staffing._http.defaults.withCredentials = true;
        } else {
            // tslint:disable-next-line:variable-name
            const BhRestToken = Cache.get('BhRestToken');
            const endpoint = Cache.get('restUrl');
            if (BhRestToken && endpoint) {
                Staffing._http.defaults.baseURL = endpoint;
                Staffing._http.defaults.params = { BhRestToken };
                Staffing._http.defaults.withCredentials = false;
            }
        }
        // Add a response interceptor
        Staffing._http.interceptors.response.use((response: AxiosResponse) => response, async (error: any) => {
            // Check if Unauthorized Error
            if (error.response.status === 401) {
                Staffing.unauthorized.next(error);
            }
            return Promise.reject(error);
        });

        return Staffing._http;
    }

    async ping(): Promise<AxiosResponse> {
        const http = Staffing.http();
        return http.get('ping');
    }
}
