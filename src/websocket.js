/**
 * WebSocket Server for Real-time Updates
 * Handles real-time communication between faculty and students
 */

const WebSocket = require('ws');
const { verifyToken } = require('./auth');

// Store connected clients by student ID
const studentConnections = new Map();

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ 
    server,
    path: '/ws'
  });

  wss.on('connection', (ws, req) => {
    console.log('🔌 New WebSocket connection attempt');
    
    let studentId = null;
    let isAuthenticated = false;

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Handle authentication
        if (data.type === 'auth') {
          const token = data.token;
          
          if (!token) {
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'No token provided' 
            }));
            return;
          }

          try {
            const decoded = verifyToken(token);
            
            if (decoded && decoded.studentId) {
              studentId = decoded.studentId;
              isAuthenticated = true;
              
              // Store connection
              studentConnections.set(studentId, ws);
              
              console.log(`✅ Student ${studentId} authenticated via WebSocket`);
              
              ws.send(JSON.stringify({ 
                type: 'auth_success',
                message: 'Connected to real-time updates',
                studentId
              }));
            } else {
              ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Invalid token' 
              }));
            }
          } catch (error) {
            console.error('❌ Token verification failed:', error.message);
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'Authentication failed' 
            }));
          }
        }
        
        // Handle ping/pong for keep-alive
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
        
      } catch (error) {
        console.error('❌ WebSocket message error:', error.message);
      }
    });

    ws.on('close', () => {
      if (studentId) {
        studentConnections.delete(studentId);
        console.log(`🔌 Student ${studentId} disconnected from WebSocket`);
      }
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
    });
  });

  console.log('🔌 WebSocket server initialized on /ws');
  
  return wss;
}

/**
 * Send marks update to a specific student
 */
function notifyStudentMarksUpdate(studentId, marksData) {
  const ws = studentConnections.get(studentId);
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'marks_updated',
      data: marksData
    }));
    console.log(`📤 Sent marks update to student ${studentId}`);
    return true;
  }
  
  return false;
}

/**
 * Broadcast message to all connected students
 */
function broadcastToAllStudents(message) {
  let sentCount = 0;
  
  studentConnections.forEach((ws, studentId) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      sentCount++;
    }
  });
  
  console.log(`📤 Broadcast to ${sentCount} students`);
  return sentCount;
}

/**
 * Get count of connected students
 */
function getConnectedStudentsCount() {
  return studentConnections.size;
}

module.exports = {
  setupWebSocket,
  notifyStudentMarksUpdate,
  broadcastToAllStudents,
  getConnectedStudentsCount
};
