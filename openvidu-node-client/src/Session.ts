/*
 * (C) Copyright 2017-2020 OpenVidu (https://openvidu.io)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import axios, { AxiosError } from 'axios';
import { Connection } from './Connection';
import { MediaMode } from './MediaMode';
import { OpenVidu } from './OpenVidu';
import { Publisher } from './Publisher';
import { Recording } from './Recording';
import { RecordingLayout } from './RecordingLayout';
import { RecordingMode } from './RecordingMode';
import { SessionProperties } from './SessionProperties';
import { Token } from './Token';
import { TokenOptions } from './TokenOptions';


export class Session {

    /**
     * Unique identifier of the Session
     */
    sessionId: string;

    /**
     * Timestamp when this session was created, in UTC milliseconds (ms since Jan 1, 1970, 00:00:00 UTC)
     */
    createdAt: number;

    /**
     * Properties defining the session
     */
    properties: SessionProperties;

    /**
     * Array of active connections to the session. This property always initialize as an empty array and
     * **will remain unchanged since the last time method [[Session.fetch]] was called**. Exceptions to this rule are:
     *
     * - Calling [[Session.forceUnpublish]] automatically updates each affected local Connection object.
     * - Calling [[Session.forceDisconnect]] automatically updates each affected local Connection object.
     * - Calling [[Session.updateConnection]] automatically updates the attributes of the affected local Connection object.
     *
     * To get the array of active connections with their current actual value, you must call [[Session.fetch]] before consulting
     * property [[activeConnections]]
     */
    activeConnections: Connection[] = [];

    /**
     * Whether the session is being recorded or not
     */
    recording = false;

    /**
     * @hidden
     */
    constructor(private ov: OpenVidu, propertiesOrJson?) {
        if (!!propertiesOrJson) {
            // Defined parameter
            if (!!propertiesOrJson.sessionId) {
                // Parameter is a JSON representation of Session ('sessionId' property always defined)
                this.resetSessionWithJson(propertiesOrJson);
            } else {
                // Parameter is a SessionProperties object
                this.properties = propertiesOrJson;
            }
        } else {
            // Empty parameter
            this.properties = {};
        }
        this.properties.mediaMode = !!this.properties.mediaMode ? this.properties.mediaMode : MediaMode.ROUTED;
        this.properties.recordingMode = !!this.properties.recordingMode ? this.properties.recordingMode : RecordingMode.MANUAL;
        this.properties.defaultOutputMode = !!this.properties.defaultOutputMode ? this.properties.defaultOutputMode : Recording.OutputMode.COMPOSED;
        this.properties.defaultRecordingLayout = !!this.properties.defaultRecordingLayout ? this.properties.defaultRecordingLayout : RecordingLayout.BEST_FIT;
    }

    /**
     * Gets the unique identifier of the Session
     */
    public getSessionId(): string {
        return this.sessionId;
    }

    /**
     * @deprecated Use [[Session.createToken]] instead to get a [[Token]] object.
     * 
     * @returns A Promise that is resolved to the generated _token_ string if success and rejected with an Error object if not
     */
    public generateToken(tokenOptions?: TokenOptions): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            this.createToken(tokenOptions).then(token => resolve(token.token)).catch(error => reject(error));
        });
    }

    /**
     * Gets a new token object associated to Session object configured with
     * `tokenOptions`. The token string value to send to the client side
     * is available at [[Token.token]] property.
     * 
     * Property [[Token.connectionId]] provides the connection identifier that will be given
     * to the user consuming the token. With `connectionId` you can call
     * the following methods without having to fetch and search for the actual
     * [[Connection]] object:
     * 
     * - Call [[Session.forceDisconnect]] to invalidate the token if no client has used it
     * yet or force the connected client to leave the session if it has.
     * - Call [[Session.updateConnection]] to update the [[Connection]] options. And this is
     * valid for unused tokens, but also for already used tokens, so you can
     * dynamically change the user connection options on the fly.
     * 
     * @returns A Promise that is resolved to the generated [[Token]] object if success and rejected with an Error object if not
     */
    public createToken(tokenOptions?: TokenOptions): Promise<Token> {
        return new Promise<Token>((resolve, reject) => {

            const data = JSON.stringify({
                session: this.sessionId,
                role: (!!tokenOptions && !!tokenOptions.role) ? tokenOptions.role : null,
                data: (!!tokenOptions && !!tokenOptions.data) ? tokenOptions.data : null,
                record: !!tokenOptions ? tokenOptions.record : null,
                kurentoOptions: (!!tokenOptions && !!tokenOptions.kurentoOptions) ? tokenOptions.kurentoOptions : null
            });
            axios.post(
                this.ov.host + OpenVidu.API_TOKENS,
                data,
                {
                    headers: {
                        'Authorization': this.ov.basicAuth,
                        'Content-Type': 'application/json'
                    }
                }
            )
                .then(res => {
                    if (res.status === 200) {
                        // SUCCESS response from openvidu-server. Resolve token
                        resolve(new Token(res.data));
                    } else {
                        // ERROR response from openvidu-server. Resolve HTTP status
                        reject(new Error(res.status.toString()));
                    }
                }).catch(error => {
                    this.handleError(error, reject);
                });
        });
    }

    /**
     * Gracefully closes the Session: unpublishes all streams and evicts every participant
     *
     * @returns A Promise that is resolved if the session has been closed successfully and rejected with an Error object if not
     */
    public close(): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            axios.delete(
                this.ov.host + OpenVidu.API_SESSIONS + '/' + this.sessionId,
                {
                    headers: {
                        'Authorization': this.ov.basicAuth,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            )
                .then(res => {
                    if (res.status === 204) {
                        // SUCCESS response from openvidu-server
                        const indexToRemove: number = this.ov.activeSessions.findIndex(s => s.sessionId === this.sessionId);
                        this.ov.activeSessions.splice(indexToRemove, 1);
                        resolve();
                    } else {
                        // ERROR response from openvidu-server. Resolve HTTP status
                        reject(new Error(res.status.toString()));
                    }
                }).catch(error => {
                    this.handleError(error, reject);
                });
        });
    }

    /**
     * Updates every property of the Session with the current status it has in OpenVidu Server. This is especially useful for accessing the list of active
     * connections of the Session ([[Session.activeConnections]]) and use those values to call [[Session.forceDisconnect]], [[Session.forceUnpublish]] or 
     * [[Session.updateConnection]].
     *
     * To update all Session objects owned by OpenVidu object at once, call [[OpenVidu.fetch]]
     *
     * @returns A promise resolved to true if the Session status has changed with respect to the server, or to false if not.
     *          This applies to any property or sub-property of the Session object
     */
    public fetch(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            const beforeJSON: string = JSON.stringify(this, this.removeCircularOpenViduReference);
            axios.get(
                this.ov.host + OpenVidu.API_SESSIONS + '/' + this.sessionId,
                {
                    headers: {
                        'Authorization': this.ov.basicAuth,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            )
                .then(res => {
                    if (res.status === 200) {
                        // SUCCESS response from openvidu-server
                        this.resetSessionWithJson(res.data);
                        const afterJSON: string = JSON.stringify(this, this.removeCircularOpenViduReference);
                        const hasChanged: boolean = !(beforeJSON === afterJSON);
                        console.log("Session info fetched for session '" + this.sessionId + "'. Any change: " + hasChanged);
                        resolve(hasChanged);
                    } else {
                        // ERROR response from openvidu-server. Resolve HTTP status
                        reject(new Error(res.status.toString()));
                    }
                }).catch(error => {
                    this.handleError(error, reject);
                });
        });
    }

    /**
     * Forces the user with Connection `connectionId` to leave the session, or invalidates the [[Token]] associated with that
     * `connectionId` if no user has used it yet.
     *
     * In the first case you can get `connection` parameter from [[Session.activeConnections]] array (remember to call [[Session.fetch]] before
     * to fetch the current actual properties of the Session from OpenVidu Server). As a result, OpenVidu Browser will trigger the proper
     * events on the client-side (`streamDestroyed`, `connectionDestroyed`, `sessionDisconnected`) with reason set to `"forceDisconnectByServer"`.
     * 
     * In the second case you can get `connectionId` parameter with [[Token.connectionId]]. As a result, the token will be invalidated
     * and no user will be able to connect to the session with it.
     * 
     * This method automatically updates the properties of the local affected objects. This means that there is no need to call
     * [[Session.fetch]] to see the changes consequence of the execution of this method applied in the local objects.
     *
     * @param connection The Connection object to disconnect from the session, or its `connectionId` property
     * 
     * @returns A Promise that is resolved if the user was successfully disconnected and rejected with an Error object if not
     */
    public forceDisconnect(connection: string | Connection): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            const connectionId: string = typeof connection === 'string' ? connection : (<Connection>connection).connectionId;
            axios.delete(
                this.ov.host + OpenVidu.API_SESSIONS + '/' + this.sessionId + '/connection/' + connectionId,
                {
                    headers: {
                        'Authorization': this.ov.basicAuth,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                })
                .then(res => {
                    if (res.status === 204) {
                        // SUCCESS response from openvidu-server
                        // Remove connection from activeConnections array
                        let connectionClosed;
                        this.activeConnections = this.activeConnections.filter(con => {
                            if (con.connectionId !== connectionId) {
                                return true;
                            } else {
                                connectionClosed = con;
                                return false;
                            }
                        });
                        // Remove every Publisher of the closed connection from every subscriber list of other connections
                        if (!!connectionClosed) {
                            connectionClosed.publishers.forEach(publisher => {
                                this.activeConnections.forEach(con => {
                                    con.subscribers = con.subscribers.filter(subscriber => {
                                        // tslint:disable:no-string-literal
                                        if (!!subscriber['streamId']) {
                                            // Subscriber with advanced webRtc configuration properties
                                            return (subscriber['streamId'] !== publisher.streamId);
                                            // tslint:enable:no-string-literal
                                        } else {
                                            // Regular string subscribers
                                            return subscriber !== publisher.streamId;
                                        }
                                    });
                                });
                            });
                        } else {
                            console.warn("The closed connection wasn't fetched in OpenVidu Java Client. No changes in the collection of active connections of the Session");
                        }
                        console.log("Connection '" + connectionId + "' closed");
                        resolve();
                    } else {
                        // ERROR response from openvidu-server. Resolve HTTP status
                        reject(new Error(res.status.toString()));
                    }
                })
                .catch(error => {
                    this.handleError(error, reject);
                });
        });
    }

    /**
     * Forces some user to unpublish a Stream (identified by its `streamId` or the corresponding [[Publisher]] object owning it).
     * OpenVidu Browser will trigger the proper events on the client-side (`streamDestroyed`) with reason set to `"forceUnpublishByServer"`.
     *
     * You can get `publisher` parameter from [[Connection.publishers]] array ([[Publisher.streamId]] for getting each `streamId` property).
     * Remember to call [[Session.fetch]] before to fetch the current actual properties of the Session from OpenVidu Server
     *
     * This method automatically updates the properties of the local affected objects. This means that there is no need to call
     * [[Session.fetch]] to see the changes consequence of the execution of this method applied in the local objects.
     * 
     * @returns A Promise that is resolved if the stream was successfully unpublished and rejected with an Error object if not
     */
    public forceUnpublish(publisher: string | Publisher): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            const streamId: string = typeof publisher === 'string' ? publisher : (<Publisher>publisher).streamId;
            axios.delete(
                this.ov.host + OpenVidu.API_SESSIONS + '/' + this.sessionId + '/stream/' + streamId,
                {
                    headers: {
                        'Authorization': this.ov.basicAuth,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            )
                .then(res => {
                    if (res.status === 204) {
                        // SUCCESS response from openvidu-server
                        this.activeConnections.forEach(connection => {
                            // Try to remove the Publisher from the Connection publishers collection
                            connection.publishers = connection.publishers.filter(pub => pub.streamId !== streamId);
                            // Try to remove the Publisher from the Connection subscribers collection
                            if (!!connection.subscribers && connection.subscribers.length > 0) {
                                // tslint:disable:no-string-literal
                                if (!!connection.subscribers[0]['streamId']) {
                                    // Subscriber with advanced webRtc configuration properties
                                    connection.subscribers = connection.subscribers.filter(sub => sub['streamId'] !== streamId);
                                    // tslint:enable:no-string-literal
                                } else {
                                    // Regular string subscribers
                                    connection.subscribers = connection.subscribers.filter(sub => sub !== streamId);
                                }
                            }
                        });
                        console.log("Stream '" + streamId + "' unpublished");
                        resolve();
                    } else {
                        // ERROR response from openvidu-server. Resolve HTTP status
                        reject(new Error(res.status.toString()));
                    }
                }).catch(error => {
                    this.handleError(error, reject);
                });
        });
    }

    /**
     * Updates the properties of a Connection. These properties are the ones defined
     * by the [[TokenOptions]] parameter when generating the token used to create the Connection.
     * These are the properties that can be updated:
     * 
     * - [[TokenOptions.role]]
     * - [[TokenOptions.record]]
     * 
     * The `connectionId` parameter can be obtained from a Connection object with
     * [[Connection.connectionId]], in which case the updated properties will
     * modify an active Connection. But `connectionId` can also be obtained from a
     * Token with [[Token.connectionId]], which allows modifying a still not used token.
     * 
     * This method automatically updates the properties of the local affected objects. This means that there is no need to call
     * [[Session.fetch]] to see the changes consequence of the execution of this method applied in the local objects.
     * 
     * @param connectionId The [[Connection.connectionId]] property of the Connection object to modify,
     * or the [[Token.connectionId]] property of a still not used token to modify
     * @param tokenOptions A new [[TokenOptions]] object with the updated values to apply
     * 
     * @returns A Promise that is resolved to the updated [[Connection]] object if the operation was
     * successful and rejected with an Error object if not
     */
    public updateConnection(connectionId: string, tokenOptions: TokenOptions): Promise<Connection> {
        return new Promise<any>((resolve, reject) => {
            axios.patch(
                this.ov.host + OpenVidu.API_SESSIONS + "/" + this.sessionId + "/connection/" + connectionId,
                tokenOptions,
                {
                    headers: {
                        'Authorization': this.ov.basicAuth,
                        'Content-Type': 'application/json'
                    }
                }
            )
                .then(res => {
                    if (res.status === 200) {
                        console.log('Connection ' + connectionId + ' updated');
                    } else if (res.status === 204) {
                        console.log('Properties of Connection ' + connectionId + ' remain the same');
                    } else {
                        // ERROR response from openvidu-server. Resolve HTTP status
                        reject(new Error(res.status.toString()));
                        return;
                    }
                    // Update the actual Connection object with the new options
                    const existingConnection: Connection = this.activeConnections.find(con => con.connectionId === connectionId);
                    if (!existingConnection) {
                        // The updated Connection is not available in local map
                        const newConnection: Connection = new Connection(res.data);
                        this.activeConnections.push(newConnection);
                        resolve(newConnection);
                    } else {
                        // The updated Connection was available in local map
                        existingConnection.overrideTokenOptions(tokenOptions);
                        resolve(existingConnection);
                    }
                }).catch(error => {
                    this.handleError(error, reject);
                });
        });
    }

    /**
     * @hidden
     */
    public getSessionIdHttp(): Promise<string> {
        return new Promise<string>((resolve, reject) => {

            if (!!this.sessionId) {
                resolve(this.sessionId);
            }

            const data = JSON.stringify({
                mediaMode: !!this.properties.mediaMode ? this.properties.mediaMode : MediaMode.ROUTED,
                recordingMode: !!this.properties.recordingMode ? this.properties.recordingMode : RecordingMode.MANUAL,
                defaultOutputMode: !!this.properties.defaultOutputMode ? this.properties.defaultOutputMode : Recording.OutputMode.COMPOSED,
                defaultRecordingLayout: !!this.properties.defaultRecordingLayout ? this.properties.defaultRecordingLayout : RecordingLayout.BEST_FIT,
                defaultCustomLayout: !!this.properties.defaultCustomLayout ? this.properties.defaultCustomLayout : '',
                customSessionId: !!this.properties.customSessionId ? this.properties.customSessionId : ''
            });

            axios.post(
                this.ov.host + OpenVidu.API_SESSIONS,
                data,
                {
                    headers: {
                        'Authorization': this.ov.basicAuth,
                        'Content-Type': 'application/json'
                    }
                }
            )
                .then(res => {
                    if (res.status === 200) {
                        // SUCCESS response from openvidu-server. Resolve token
                        this.sessionId = res.data.id;
                        this.createdAt = res.data.createdAt;
                        resolve(this.sessionId);
                    } else {
                        // ERROR response from openvidu-server. Resolve HTTP status
                        reject(new Error(res.status.toString()));
                    }
                }).catch(error => {
                    if (error.response) {
                        // The request was made and the server responded with a status code (not 2xx)
                        if (error.response.status === 409) {
                            // 'customSessionId' already existed
                            this.sessionId = this.properties.customSessionId;
                            resolve(this.sessionId);
                        } else {
                            reject(new Error(error.response.status.toString()));
                        }
                    } else if (error.request) {
                        // The request was made but no response was received
                        // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
                        // http.ClientRequest in node.js
                        console.error(error.request);
                        reject(new Error(error.request));
                    } else {
                        // Something happened in setting up the request that triggered an Error
                        console.error('Error', error.message);
                        reject(new Error(error.message));
                    }
                });
        });
    }

    /**
     * @hidden
     */
    public resetSessionWithJson(json): Session {
        this.sessionId = json.sessionId;
        this.createdAt = json.createdAt;
        this.recording = json.recording;
        let customSessionId: string;
        let defaultCustomLayout: string;
        if (!!this.properties) {
            customSessionId = this.properties.customSessionId;
            defaultCustomLayout = !!json.defaultCustomLayout ? json.defaultCustomLayout : this.properties.defaultCustomLayout;
        }
        this.properties = {
            mediaMode: json.mediaMode,
            recordingMode: json.recordingMode,
            defaultOutputMode: json.defaultOutputMode,
            defaultRecordingLayout: json.defaultRecordingLayout
        };
        if (!!customSessionId) {
            this.properties.customSessionId = customSessionId;
        } else if (!!json.customSessionId) {
            this.properties.customSessionId = json.customSessionId;
        }
        if (!!defaultCustomLayout) {
            this.properties.defaultCustomLayout = defaultCustomLayout;
        }

        this.activeConnections = [];
        json.connections.content.forEach(jsonConnection => this.activeConnections.push(new Connection(jsonConnection)));

        // Order connections by time of creation
        this.activeConnections.sort((c1, c2) => (c1.createdAt > c2.createdAt) ? 1 : ((c2.createdAt > c1.createdAt) ? -1 : 0));
        return this;
    }

    /**
     * @hidden
     */
    equalTo(other: Session): boolean {
        let equals: boolean = (
            this.sessionId === other.sessionId &&
            this.createdAt === other.createdAt &&
            this.recording === other.recording &&
            this.activeConnections.length === other.activeConnections.length &&
            JSON.stringify(this.properties) === JSON.stringify(other.properties)
        );
        if (equals) {
            let i = 0;
            while (equals && i < this.activeConnections.length) {
                equals = this.activeConnections[i].equalTo(other.activeConnections[i]);
                i++;
            }
            return equals;
        } else {
            return false;
        }
    }

    /**
     * @hidden
     */
    private removeCircularOpenViduReference(key: string, value: any) {
        if (key === 'ov' && value instanceof OpenVidu) {
            return;
        } else {
            return value;
        }
    }

    /**
     * @hidden
     */
    private handleError(error: AxiosError, reject: (reason?: any) => void) {
        if (error.response) {
            // The request was made and the server responded with a status code (not 2xx)
            reject(new Error(error.response.status.toString()));
        } else if (error.request) {
            // The request was made but no response was received
            // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
            // http.ClientRequest in node.js
            console.error(error.request);
            reject(new Error(error.request));
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('Error', error.message);
            reject(new Error(error.message));
        }
    }

}