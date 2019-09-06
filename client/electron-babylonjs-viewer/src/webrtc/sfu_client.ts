import { WebSocketClient } from "./signaling/websocket_client";
import { SignalingMessage } from "./signaling/signaling_message";

export class SfuClient {

    private _wsclient: WebSocketClient;
    private _peer: RTCPeerConnection;
    public onStream: (stream: MediaStream) => void;

    constructor(signalingUrl: string) {
        this._wsclient = new WebSocketClient(signalingUrl);
        this._wsclient.onMessage = this.onSignalingMessage;

        this._peer = this.setupPeerConnection();
    }

    setupPeerConnection = () => {

        const pc_config = {
            iceServers: [{ "urls": "stun:stun.webrtc.ecl.ntt.com:3478" }],
            bundlePolicy: "max-bundle",
            rtcpMuxPolicy: "require",
            sdpSemantics: "plan-b"
        };

        const peer = new RTCPeerConnection(pc_config as RTCConfiguration);

        (peer as any).onaddstream = evt => {
            if (this.onStream) {
                this.onStream(evt.stream)
            }
        };

        peer.oniceconnectionstatechange = () => {
            console.log('ICE connection Status has changed to ' + peer.iceConnectionState);
            switch (peer.iceConnectionState) {
                case 'disconnected':
                    this.disconnect();
                    break;
            }
        }

        return peer;
    }

    onSignalingMessage = (message: SignalingMessage) => {
        switch (message.type) {
            case "answer":
                this.setAnsewrAsync(message);
                break;
            case "update":
                this.setUpdateAsync(message);
                break;
        }
    };

    public connect = async (stream: MediaStream, roomName: string, userName: string) => {
        if (this._peer == null) { return; }

        (this._peer as any).addStream(stream);

        try {
            let offer = await this.makeOfferAsync();
            let message = new SignalingMessage({
                type: offer.type,
                sdp: offer.sdp,
                roomName: roomName,
                userName: userName
            });
            this.sendSignalingMessage(message);
        } catch (e) {
            console.log(e);
        }
    };

    public disconnect = () => {
        this._peer.close();
        this._wsclient.close();
    }

    private sendSignalingMessage = (message: SignalingMessage) => {
        this._wsclient.sendMesage(message);
    };

    private makeOfferAsync = async (): Promise<RTCSessionDescription> => {
        return new Promise(async (resolve, reject) => {
            try {
                let offer = await this._peer.createOffer();
                await this._peer.setLocalDescription(offer);
                resolve(this._peer.localDescription);
            } catch (e) {
                reject(e);
            }
        });
    };

    private setAnsewrAsync = async (message: SignalingMessage) => {
        const answer = new RTCSessionDescription({
            type: 'answer',
            sdp: message.sdp
        });
        await this._peer.setRemoteDescription(answer);
    };

    private setUpdateAsync = async (message: SignalingMessage) => {
        const offer = new RTCSessionDescription({
            type: 'offer',
            sdp: message.sdp
        });

        try {
            await this._peer.setRemoteDescription(offer);

            const answer = await this._peer.createAnswer();

            await this._peer.setLocalDescription(answer);
        } catch (e) {
            console.log('updaate error: ', e);
        }
    };
}