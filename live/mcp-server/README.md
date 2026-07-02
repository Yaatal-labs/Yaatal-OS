# Yaatal Live MCP Server

Exposes OBS control as MCP tools so the gateway (OpenClaw fork) can
orchestrate livestream selling sessions.

## Tools

| Tool | Description |
|---|---|
| `start_session` | Initialize session with products, create scenes |
| `go_live` | Start streaming + recording + replay buffer |
| `end_stream` | Stop streaming gracefully |
| `end_session` | Clean up all product scenes |
| `switch_product` | Switch to a product's scene + mark chapter |
| `update_price` | Update price overlay in real-time |
| `update_cta` | Update call-to-action overlay |
| `mark_sold_out` | Show SOLD OUT stamp + clip the moment |
| `clear_sold_out` | Hide SOLD OUT stamp |
| `clip_moment` | Save replay buffer clip |
| `send_caption` | Push live captions to stream |
| `start_virtual_camera` | Start Virtual Camera for TikTok bridge |
| `stop_virtual_camera` | Stop Virtual Camera |
| `duck_music` | Lower background music |
| `restore_music` | Restore background music |

## Install

```bash
pip install -r ../obs-controller/requirements.txt
pip install mcp
```

## Run

```bash
python server.py
```

Connects to OBS on localhost:4455 by default.

## Claude Code / OpenClaw integration

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "yaatal-live": {
      "command": "python",
      "args": ["/path/to/Yaatal-Studio/live/mcp-server/server.py"],
      "env": {
        "OBS_HOST": "localhost",
        "OBS_PORT": "4455",
        "OBS_PASSWORD": ""
      }
    }
  }
}
```