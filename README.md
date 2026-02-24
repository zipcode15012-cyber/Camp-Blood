# ⛺ CAMP BLOOD — Multiplayer Setup Guide

## Files
- `server.js` — WebSocket game server
- `index.html` — Game client (open in browser)
- `package.json` — Node.js dependencies

---

## Quick Start (1 minute)

### Step 1 — Install Node.js
Download from https://nodejs.org (v18+ recommended)

### Step 2 — Install & Run the Server
Open a terminal in this folder and run:
```
npm install
node server.js
```
You should see:
```
⛺ CAMP BLOOD SERVER running on port 3000
   HTTP:      http://localhost:3000
   WebSocket: ws://localhost:3000
```

### Step 3 — Open the Game
Open `index.html` in your browser (Chrome/Firefox recommended).

- **Your name:** enter a nickname
- **Room code:** leave blank to CREATE a new room, or enter a friend's code to JOIN
- **Server IP:** keep as `localhost:3000` if you're on the same machine as the server

### Step 4 — Share with Friends
Find your local IP address:
- **Windows:** open Command Prompt → type `ipconfig` → look for "IPv4 Address" (e.g., `192.168.1.105`)
- **Mac/Linux:** open Terminal → type `ifconfig` or `ip addr`

Tell your friends to:
1. Open `index.html`
2. Enter server IP as `192.168.1.105:3000` (your IP)
3. Enter the room code shown in your lobby

---

## Playing Online (over the internet)
To play with friends not on your WiFi, you need to forward port 3000 on your router,
or use a free tunnel service like **ngrok**:

```
npm install -g ngrok
ngrok tcp 3000
```
This gives you a public address like `tcp://0.tcp.ngrok.io:12345`.
Friends connect to `0.tcp.ngrok.io:12345` as the server address.

---

## How to Play

### Lobby
1. Connect with your name
2. Click **SELECT CLASS** to choose your role
3. Click **LOCK IN** when ready
4. Wait for all players to lock in (or host clicks START)

### Controls
| Key | Action |
|-----|--------|
| WASD | Move |
| Mouse | Look |
| Shift | Sprint |
| C / Ctrl | Crouch |
| Space | Jump |
| E | Interact / Escape zone |
| F | Attack (Killer) / Use weapon (Survivor) |
| G | Use class ability |
| Enter | Open chat |
| 1-4 | Select weapon slot |

---

## Survivor Classes

### 🏃 ATHLETE — PASSIVE
- Stamina pool 2.5x larger
- Sprint speed +25%
- Best for escaping

### 🛡️ TANK — PASSIVE
- Absorbs 2 extra hits (5 hits to die total)
- Slightly less stamina
- Best for taking hits while others escape

### 🕶️ STEALTHY — UNIQUE [G]
- Press G: **CLOAK** for 8 seconds — invisible to killer, no detection
- 14 second cooldown
- Getting hit breaks cloak early
- Can still be hit while invisible

### 💉 MEDIC — UNIQUE [G]
- Hold G near a downed player: **HEAL** them back to healthy
- Works on yourself too
- 15 second cooldown (3 second if interrupted)

### 👊 HEAVYHITTER — UNIQUE [G]
- Hold G: **CHARGE** a punch
- Release G: punch the killer (must be within 5m)
- Charge time = stun duration (up to 5 seconds)
- Full 5-second charge: **blinds** killer with white flash
- After a full punch: **Sore Knuckles** for 13 seconds
  - Sore knuckles: max 2s stun, no blind
- **Quick punch** (tap G): short stun, no sore knuckles

### ⚡ ADRENALINE — PASSIVE + UNIQUE [G]
- **PASSIVE:** Speed gradually increases as fear rises
- **G (only at FULL fear):** Activate REACTION for 15 seconds:
  - Fear bar locked in place
  - Stamina regenerates 2× faster
  - Getting hit gives a speed boost instead of a state change
- **After REACTION ends:** 20-second cooldown + 10-second **Exhausted** debuff:
  - Slower movement
  - Stamina drains faster
  - Only 2 hits to die (downed → dead)
- **Tip:** If you're downed and activate REACTION, you return to healthy

---

## Killer Classes

### ⚔️ WRAITH
- Standard 3-hit melee attacker
- **G: PHASE** — become translucent, move 60% faster for 6 seconds
- Cannot attack while phased
- 30-second cooldown

### 👁️ NIGHTMARE
- Slightly slower movement
- **G: FEAR BOLT** — fire a projectile (20m range) that maxes the target's fear bar
- If target already has full fear: deals a real hit instead
- 10-second cooldown

### 👻 PHANTOM
- **G: BLINK** — teleport to the nearest survivor's position
- Cannot blink to hiding players
- 18-second cooldown

### 🎭 PUPPETEER
- **G: MARK** — scramble a nearby survivor's (10m) WASD controls for 5 seconds
- Target sees a purple warning vignette
- 12-second cooldown

---

## Hit States (Survivors)

| State | Effect | Recovery |
|-------|--------|----------|
| **Healthy** | Normal movement | — |
| **Dash** (1st hit) | Short speed burst → then slower than normal | 20s without being hit → returns to Healthy |
| **Downed** (2nd hit) | Permanently crouched, significantly slowed | 20s → returns to Dash, OR Medic heals to Healthy |
| **Dead** (3rd hit) | Eliminated | Spectate + possible Guardian Angel |

**Tank class:** takes 5 hits instead of 3 to die.

---

## Guardian Angel ⭐
- The **first player to die** becomes the Guardian Angel
- They can protect ONE survivor at a time (click their name in spectator UI)
- If the killer would kill a protected survivor: killer is **stunned 8 seconds + blinded**
- Guardian Angel can switch protection target at any time

---

## Escape Routes (visible on minimap as green squares)
- **Car** (northeast corner) — reach the green zone
- **Boat** (lake, south) — reach the boat dock
- **Phone** (northwest) — reach the phone box

Press **E** when standing in the green zone to escape.

---

## Server Config
Edit `server.js` top variables:
- `PORT` — default 3000, change with `PORT=3001 node server.js`

The server prints a status page at `http://localhost:3000` showing active rooms.

---

## Troubleshooting

**"Connection failed — is server running?"**
→ Make sure you ran `npm install` then `node server.js`

**Friends can't connect**
→ They need your actual IP address, not `localhost`
→ Check your firewall isn't blocking port 3000

**Game is laggy**
→ All players should be on the same network for best performance
→ For internet play, use ngrok (see above)

**"Room full (max 5)"**
→ Max 5 players per room (4 survivors + 1 killer)
