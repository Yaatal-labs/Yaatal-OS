# Yaatal Live Multistream

Configuration templates for streaming to multiple platforms simultaneously.

## Platform support matrix

| Platform | Protocol | OBS Support | African Market |
|---|---|---|---|
| **Facebook Live** | RTMP | ✅ Native OBS | ✅ Widely used in West Africa |
| **YouTube Live** | RTMPS | ✅ Native OBS | ✅ Good coverage, low latency |
| **TikTok Live** | Virtual Camera | ⚠️ Bridge via TikTok Live Studio | ⚠️ Senegal ban (Aug 2023) — check current status |
| **Instagram Live** | ❌ No RTMP | ❌ Phone only | Use for Reels repurposing, not live |
| **Twitch** | RTMP | ✅ Native OBS | Low usage in West Africa |

## How multistream works

```
OBS Studio (single scene composite)
  ├── RTMP output #1 → Facebook Live (via obs-multi-rtmp plugin)
  ├── RTMP output #2 → YouTube Live (via obs-multi-rtmp plugin)
  └── Virtual Camera → TikTok Live Studio (separate app)
```

## Setup

1. **Install obs-multi-rtmp plugin**: https://github.com/sorayuki/obs-multi-rtmp (4.9k stars, GPLv2)
2. **Configure Facebook**: Open `facebook.json`, follow instructions to get stream key
3. **Configure YouTube**: Open `youtube.json`, follow instructions to get stream key
4. **Configure TikTok**: Open `tiktok_virtualcam.json`, install TikTok Live Studio, set Virtual Camera as camera
5. **In OBS**: Tools → obs-multi-rtmp → add Facebook and YouTube RTMP targets
6. **Go live**: Start OBS stream (Facebook+YouTube via multi-rtmp) + start TikTok Live Studio stream

## Bandwidth note

Streaming to 2 RTMP targets simultaneously requires ~2x upload bandwidth.
- 1080p30 @ 4 Mbps × 2 = 8 Mbps upload needed
- 720p30 @ 2.5 Mbps × 2 = 5 Mbps upload needed
- Check your ISP upload speed — Senegal ADSL typically has lower upload
- Consider 720p for multistream on slower connections