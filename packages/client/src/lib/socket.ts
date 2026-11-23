import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let currentToken: string | undefined = undefined;

export function getSocket(token?: string): Socket {
  if (socket) {
    if (token !== undefined && token !== currentToken) {
      currentToken = token;
      socket.auth = token ? { token } : {};
      if (socket.connected) {
        socket.disconnect().connect();
      }
    }
    return socket;
  }

  currentToken = token;
  socket = io('/', {
    withCredentials: true,
    auth: token ? { token } : {},
    reconnectionDelayMax: 5000,
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  currentToken = undefined;
}
