module.exports = {
  apps: [{
    name: 'ai-agent-dashboard',
    script: 'server/server.js',
    cwd: '/root/ai-agent-dashboard',
    node_args: '--experimental-modules',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
  }],
}
