/*
 * (C) Copyright 2017-2018 OpenVidu (https://openvidu.io/)
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

package io.openvidu.server.core;

import java.util.Set;

import org.json.simple.JSONObject;

import io.openvidu.java.client.SessionProperties;

public interface Session {

	String getSessionId();

	SessionProperties getSessionProperties();

	void join(Participant participant);

	void leave(String participantPrivateId, String reason);

	boolean close(String reason);

	boolean isClosed();

	Set<Participant> getParticipants();

	Participant getParticipantByPrivateId(String participantPrivateId);

	Participant getParticipantByPublicId(String participantPublicId);

	int getActivePublishers();

	JSONObject toJSON();

	JSONObject withStatsToJSON();

}
