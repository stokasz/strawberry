# Visual language

Strawberry uses a small ASCII bunny mascot holding a 🍓. Two variants exist: a **dual-character sharing story** in the CLI TUI, and a **single-character progress mascot** in Telegram.

## Character

Classic copypasta bunny shape:

```
{\__/}
( face )
/ > 🍓
```

Arms can be empty (`/`, `\ <`) or hold the fruit (`/ > 🍓`, `🍓 < \`).

### Faces

| Face | Meaning |
|------|---------|
| `o_o` | Neutral / working |
| `^_^` | Happy / done |
| `x_x` | Error |

Telegram progress uses all three. The TUI sharing story uses `o_o` before the handoff and `^_^` after.

## Character & story

### Lessons from Mickey

Not the merch empire — the mechanics:

- **One gesture, everywhere.** Mickey is a circle you can draw on anything. Ours is a bunny holding or passing a strawberry. That is the whole brand in three lines of ASCII.
- **Joy before competence.** The character makes hard things feel survivable. Onchain work is scary; the bunny's job is to make you smile *while* you sign.
- **Participation, not spectacle.** Like the 1930 *Mickey Mouse Book*'s game and march, the bunny invites you in: pair, tag, share a session — you are in the story, not watching a bot perform.
- **Hop, don't march.** Our bunny **hops** — light, curious, step to step across chains, blocks, and confirmations. Not "executing transactions." **Hopping through them.**

### The story

You run a small agent at home — a **host bunny**. It finds something good onchain: a read, a sign, a swap, an answer your group needs.

Your friends are in Telegram — the **group bunny**. They cannot see your keys or your machine. They only see: *share?*

The host passes the strawberry across. Not custody — **the fruit of the work**: clarity, a signed tx explained, a coordinated move, a reply everyone can use.

Both bunnies end `^_^`. Nobody got rugged by the mascot. Something useful crossed the gap, and it felt a little fun.

**Local trust, multiplayer joy.**

### Why two bunnies?

The product lives in two places that have to meet:

| Bunny | Where | Holds |
|-------|--------|--------|
| **Host** | Your machine / CLI | The stack, keys, agent — the strawberry *before* the pass |
| **Group** | Telegram | The chat, the people — empty arms until *share?* |

One bunny would be a solo tool. Two bunnies are the **handoff** — local-first, non-custodial, multiplayer AI.

The visual beats are the product beats:

1. **Ask** — `share?` (group wants in; host has capability)
2. **Pass** — `/ > 🍓  ---->` (work crosses; keys stay home)
3. **Receive** — `🍓 < \` + `^_^` (group got something sweet; host is happy too)

The strawberry is not "crypto" literally. It is **whatever good thing the hop produced** — an insight, a clean tx, a moment of shared understanding.

## Voice

The product speaks through the strawberry-sharing identity: local, small, helpful, and collaborative. The bunnies are not decoration; they are the visible shorthand for "this agent is here with the group, passing useful work forward."

Use this voice for customer-facing surfaces:

- Warm, but concise.
- Playful at the edges, never noisy.
- Collaborative: prefer sharing, pairing, passing, helping, and working together over generic automation language.
- Clear in failure states; the mascot can look sad or broken, but the copy should stay direct and actionable.

## Design Vision

The core word is **intention**.

Agents operate on human language, by human language. The magic is that a person can state an intention, and the agent can help make it happen. Strawberry puts that magic in the suit of a small bunny: approachable, careful, and memorable.

The bunny does not "execute transactions" as a cold machine. She **hops** with the user's intention:

- From the local machine into Telegram.
- From the group chat to the agent.
- From the agent toward typed host APIs.
- Across onchain steps, checks, and confirmations.
- Back to the user with the result.

The strawberry carries several meanings at once:

- Summer, sweetness, and good times ahead.
- A shared object, not a hoarded one.
- A reminder of the early AI struggle with counting the `r`s in "strawberry": everyone, human or machine, has rough edges.
- A soft promise that shared intention can make hard things lighter.

The product should make crypto feel less like machinery and more like a careful little journey: intention, hop, check, return.

## Character Principles

The bunny should become familiar through repeated behavior, not exposition. The product should show who she is by what she does with the user and the group.

- Give her a job: she carries the strawberry, passes it forward, and stays with the conversation while work is happening.
- Give her a small myth: the strawberry is shared intention, not owned output. It marks useful work moving from one person or surface to another.
- Keep the shape instantly recognizable: ears, face, arm, strawberry. Do not add detail that weakens recognition at terminal or chat scale.
- Let props do work: the strawberry should signal state, handoff, care, or progress rather than act as a generic logo stamp.
- Make participation part of the identity: the user should feel invited to pair, mention, reply, share context, and keep the group moving.
- Preserve a little mischief, but keep trust primary. The bunny can be curious and playful; she cannot obscure security, errors, or user control.
- Keep her in-story across surfaces: TUI starts and hosts the sharing story; Telegram continues it as a live progress companion.

## ASCII sheet — two bunnies (16)

Reference library for dual-bunny art. Left is **host** (CLI/local); right is **group** (Telegram). Panels 1–3 are the canonical TUI story.

### 1. Share?

```
      {\__/}              {\__/}
      ( o_o)              (o_o )  share?
      / > 🍓              \ <
```

### 2. Pass

```
      {\__/}              {\__/}
      ( o_o)              ( o_o)
      / > 🍓  ---->       \ <
```

### 3. Received

```
      {\__/}              {\__/}
      ( ^_^)              (^_^ )
      /                   🍓 < \
```

### 4. Hop

```
      {\__/}   · hop ·   {\__/}
      ( ^_^)      ·      ( ^_^)
      /  🍓     ---->    🍓  \
```

### 5. Working

```
      {\__/}              {\__/}
      ( o_o)    ···       ( o_o)
      / > 🍓    block     \ <
```

### 6. Pairing

```
      {\__/}              {\__/}
      ( o_o)   /pair      ( o_o)
      / > 🍓   ----->     \ <
```

### 7. Connected

```
      {\__/}              {\__/}
      ( ^_^)     hi!      ( ^_^)
      / > 🍓              🍓 < \
```

### 8. Signing

```
      {\__/}              {\__/}
      ( o_o)    sign…     ( o_o)
      / > 🍓              \ <  …
```

### 9. Error

```
      {\__/}              {\__/}
      ( x_x)    oops      ( o_o)
      /  🍓               \ <
```

### 10. Timeout

```
      {\__/}              {\__/}
      ( -_-)    zzz       ( -_-)
      / > 🍓              \ <
```

### 11. Fresh session

```
      {\__/}              {\__/}
      ( ^_^)   reset!     ( ^_^)
      / > 🍓              🍓 < \
```

### 12. Upload

```
      {\__/}              {\__/}
      ( o_o)   [===]      ( o_o)
      / > 🍓  ======>     \ <
```

### 13. Unpaired

```
      {\__/}              · · ·
      ( o_o)   pair?      · · ·
      / > 🍓              · · ·
```

### 14. Idle group

```
      {\__/}              {\__/}
      ( o_o)              ( -.-) zzz
      / > 🍓              \ <
```

### 15. Multichain hop

```
      {\__/}  -🍓- -🍓-   {\__/}
      ( o_o)   hop hop    ( o_o)
      /                     \
```

### 16. Done

```
      {\__/}              {\__/}
      ( ^_^)              ( ^_^)
         \      🍓       /
          \    done!
```

## Guardrails

- Keep the mascot text-first: no image, animation, or render-plane dependency for this visual language.
- Reuse the existing three faces unless a new user-visible state is added and tested.
- TUI art should remain a short sharing story: ask, pass, receive.
- Telegram progress should stay one silent message edited in place, not a stream of mascot messages.
- Emoji-only copy may use the 🍓 prefix, but ASCII bunny art is reserved for progress/status surfaces.
- Any change to the mascot shape, faces, or handoff story must update the matching TUI or Telegram tests.

## TUI — dual-character art

Defined in `packages/cli/src/tui.ts` as `STRAWBERRY_ART`. Two bunnies interact in three beats:

1. **Ask** — left holds the strawberry; right asks `share?`
2. **Pass** — left throws `/ > 🍓  ---->` toward right
3. **Receive** — right holds `🍓 < \`; both are `^_^`

TUI segments are color-coded: green ears (`leaf`), red body/strawberry holder (`seed`), grey for the receiving bunny (`muted`).

### Where it appears

| Surface | Trigger |
|---------|---------|
| Launch banner | `strawberry start` (with vision tagline) |
| Running panel | `strawberry start` after stack is up |
| Command headers | `onboard`, `login`, `doctor`, `status`, `stop` |
| Help | `strawberry`, `strawberry --help` |

Related copy on the running panel: *"sharing the fruit in Telegram"*.

## Telegram — single-character progress

Defined in `packages/telegram/src/gateway.ts` as `formatProgressStatus()`. One bunny; status text follows the strawberry on the third line.

Shown as a silent reply that is edited in place while the agent works (e.g. *looking through recent chat…*, *asking the agent…*, tool labels, *writing reply…*, *done*).

### Where it appears

| Surface | Trigger |
|---------|---------|
| Progress messages | Any addressed prompt while the agent runs |
| Error progress | Agent request failure (`x_x`) |

## Telegram — emoji-only copy

Same gateway file. 🍓 prefix, no ASCII bunny — pairing states, session reset, and connection errors.
