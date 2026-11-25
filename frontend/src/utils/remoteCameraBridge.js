import { supabase } from '../supabaseClient';
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};
function tuneSenderBitrate(pc) {
  try {
    pc.getSenders().forEach(sender => {
      if (sender.track && sender.track.kind === 'video') {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = 2500000;
        params.degradationPreference = 'maintain-framerate';
        sender.setParameters(params).catch(() => {});
      }
    });
  } catch {}
}
export function startCameraBroadcaster({ deviceId, deviceName, stream, onPeerState }) {
  let pc = null;
  let pendingIce = [];
  let closed = false;
  const channel = supabase.channel(`cam_bridge_${deviceId}`, {
    config: { broadcast: { self: false } }
  });
  const createAndSendOffer = async () => {
    if (closed || !stream) return;
    if (pc) {
      try { pc.close(); } catch {}
    }
    pendingIce = [];
    pc = new RTCPeerConnection(ICE_CONFIG);
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    tuneSenderBitrate(pc);
    pc.onicecandidate = (e) => {
      if (e.candidate && !closed) {
        channel.send({
          type: 'broadcast',
          event: 'rtc-ice',
          payload: { from: 'broadcaster', candidate: e.candidate }
        }).catch(() => {});
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (!pc || closed) return;
      const st = pc.iceConnectionState;
      if (st === 'connected' || st === 'completed') {
        onPeerState && onPeerState('connected');
      } else if (st === 'disconnected' || st === 'failed') {
        onPeerState && onPeerState('reconnecting');
      }
    };
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      channel.send({
        type: 'broadcast',
        event: 'rtc-offer',
        payload: { sdp: pc.localDescription }
      }).catch(() => {});
    } catch {}
  };
  channel
    .on('broadcast', { event: 'request-offer' }, () => {
      onPeerState && onPeerState('connecting');
      createAndSendOffer();
    })
    .on('broadcast', { event: 'rtc-answer' }, async ({ payload }) => {
      if (!pc || !payload?.sdp || closed) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        while (pendingIce.length > 0) {
          const c = pendingIce.shift();
          await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
      } catch {}
    })
    .on('broadcast', { event: 'rtc-ice' }, async ({ payload }) => {
      if (!payload?.candidate || payload.from !== 'receiver' || closed) return;
      if (!pc || !pc.remoteDescription) {
        pendingIce.push(payload.candidate);
      } else {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch {}
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED' && !closed) {
        channel.send({
          type: 'broadcast',
          event: 'heartbeat',
          payload: { deviceId, deviceName, online: true, timestamp: Date.now() }
        }).catch(() => {});
      }
    });
  const heartbeatInterval = setInterval(() => {
    if (closed) return;
    channel.send({
      type: 'broadcast',
      event: 'heartbeat',
      payload: { deviceId, deviceName, online: true, timestamp: Date.now() }
    }).catch(() => {});
  }, 2500);
  return {
    sendGpsUpdate: (gps) => {
      if (closed) return;
      channel.send({
        type: 'broadcast',
        event: 'gps-update',
        payload: { ...gps, deviceId, timestamp: Date.now() }
      }).catch(() => {});
    },
    cleanup: () => {
      closed = true;
      clearInterval(heartbeatInterval);
      if (pc) {
        try { pc.close(); } catch {}
        pc = null;
      }
      supabase.removeChannel(channel);
    }
  };
}
export function startCameraReceiver({ deviceId, onStream, onGpsUpdate, onConnectionState, onHeartbeat }) {
  let pc = null;
  let pendingIce = [];
  let closed = false;
  let reconnectTimer = null;
  const channel = supabase.channel(`cam_bridge_${deviceId}`, {
    config: { broadcast: { self: false } }
  });
  const sendOfferRequest = () => {
    if (closed) return;
    channel.send({
      type: 'broadcast',
      event: 'request-offer',
      payload: { timestamp: Date.now() }
    }).catch(() => {});
  };
  channel
    .on('broadcast', { event: 'heartbeat' }, ({ payload }) => {
      if (closed) return;
      onHeartbeat && onHeartbeat(payload);
    })
    .on('broadcast', { event: 'gps-update' }, ({ payload }) => {
      if (closed) return;
      onGpsUpdate && onGpsUpdate(payload);
    })
    .on('broadcast', { event: 'rtc-offer' }, async ({ payload }) => {
      if (!payload?.sdp || closed) return;
      if (pc) {
        try { pc.close(); } catch {}
      }
      pendingIce = [];
      pc = new RTCPeerConnection(ICE_CONFIG);
      pc.ontrack = (e) => {
        if (e.streams && e.streams[0] && !closed) {
          onStream && onStream(e.streams[0]);
        }
      };
      pc.onicecandidate = (e) => {
        if (e.candidate && !closed) {
          channel.send({
            type: 'broadcast',
            event: 'rtc-ice',
            payload: { from: 'receiver', candidate: e.candidate }
          }).catch(() => {});
        }
      };
      pc.oniceconnectionstatechange = () => {
        if (!pc || closed) return;
        const st = pc.iceConnectionState;
        if (st === 'connected' || st === 'completed') {
          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
          onConnectionState && onConnectionState('connected');
        } else if (st === 'disconnected' || st === 'failed') {
          onConnectionState && onConnectionState('reconnecting');
          if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              sendOfferRequest();
            }, 2500);
          }
        }
      };
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        while (pendingIce.length > 0) {
          const c = pendingIce.shift();
          await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        channel.send({
          type: 'broadcast',
          event: 'rtc-answer',
          payload: { sdp: pc.localDescription }
        }).catch(() => {});
      } catch {}
    })
    .on('broadcast', { event: 'rtc-ice' }, async ({ payload }) => {
      if (!payload?.candidate || payload.from !== 'broadcaster' || closed) return;
      if (!pc || !pc.remoteDescription) {
        pendingIce.push(payload.candidate);
      } else {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch {}
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED' && !closed && onStream) {
        onConnectionState && onConnectionState('connecting');
        sendOfferRequest();
      }
    });
  return {
    requestOffer: sendOfferRequest,
    cleanup: () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pc) {
        try { pc.close(); } catch {}
        pc = null;
      }
      supabase.removeChannel(channel);
    }
  };
}
