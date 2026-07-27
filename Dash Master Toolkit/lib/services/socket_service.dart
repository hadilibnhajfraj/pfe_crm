// lib/services/socket_service.dart
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

class SocketService {
  static final SocketService instance = SocketService._();
  SocketService._();

  io.Socket? _socket;
  bool _intentionalDisconnect = false;

  bool get isConnected => _socket?.connected ?? false;

  void connect(String baseUrl, String token) {
    if (isConnected) return;
    _intentionalDisconnect = false;

    try {
      _socket = io.io(
        baseUrl,
        io.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .setAuth({'token': token})
            .enableAutoConnect()
            .enableReconnection()
            .setReconnectionAttempts(5)
            .setReconnectionDelay(2000)
            .build(),
      );

      _socket!.onConnect((_) {
        debugPrint('[Socket] ✅ connected');
      });

      _socket!.onDisconnect((_) {
        if (!_intentionalDisconnect) {
          debugPrint('[Socket] ⚠️ disconnected — will reconnect');
        }
      });

      _socket!.onConnectError((e) {
        debugPrint('[Socket] connect error: $e');
      });

      _socket!.connect();
    } catch (e) {
      debugPrint('[Socket] init error: $e');
    }
  }

  void disconnect() {
    _intentionalDisconnect = true;
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
  }

  void on(String event, void Function(dynamic) handler) {
    _socket?.on(event, handler);
  }

  void off(String event) {
    _socket?.off(event);
  }

  void emit(String event, [dynamic data]) {
    if (isConnected) {
      _socket?.emit(event, data);
    }
  }

  void joinRoom(String room) => emit('join', room);
  void leaveRoom(String room) => emit('leave', room);
}

// ── Polling fallback for real-time updates ─────────────────────────────────────
// Used when Socket.IO is not available on the backend.
class PollingService {
  Timer? _timer;

  void start({
    required Duration interval,
    required Future<void> Function() onTick,
  }) {
    _timer?.cancel();
    _timer = Timer.periodic(interval, (_) async {
      try { await onTick(); } catch (_) {}
    });
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }
}
