# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(A Capacitor Android wrapper exists in the repo, but no APK is distributed from the site; the design language stays web.)

## Users

University students, at any campus, who want to talk to someone new without the weight of a profile. The usual moment is on a phone, between classes, in a hostel room at night, or bored in the library: open the app, get matched, talk. Returning users come back to message the people they unlocked as friends.

## Product Purpose

LpuTV pairs two students at random for an anonymous text chat, with an optional video call. Each random chat runs on a 10-minute timer that both people can agree to extend. If both people tap "Enjoying this?", they unlock the option to add each other as friends, and accepting a friend request reveals both identities. Friends can then open a direct chat any time.

Success means a student gets from landing to a live conversation in seconds, feels safe enough to stay, and comes back to talk to friends.

## Positioning

Anonymity comes first, and identity is earned by both sides. Nobody is revealed until both people have enjoyed the chat and both have accepted the friend request. A timed 10-minute session keeps the stakes low: skip, extend, or let it end.

## Operating Context

- Entry is a guest login: choose a gender, confirm 18+ and accept the terms, and receive a generated handle (`Guest-xxxxxx`). Optional Google sign-in gives a verified badge for college domains (`VERIFIED_DOMAINS`, default `lpu.in`).
- Screens: landing, onboarding (rules, camera explainer, consent), dashboard (profile, bio, interests, friends with presence, settings, data export/delete), random matching (queue size, tips, feedback), direct calling, chat (alias, timer, consent rail, icebreakers, extend, report/block, skip), video call, legal pages (/safety, /privacy, /terms), server wake-up overlay, and an admin panel at `/admin` on the API.
- The backend runs on Render's free tier, so it sleeps when idle. The first request can take about a minute, which the wake-up overlay covers.
- Mostly used on phones, often on Android.

## Capabilities and Constraints

- Random chats last 10 minutes. Extending resets the timer to 10 minutes and needs both people to agree. Video unlocks 30 seconds into a random chat. Direct chats with friends have no timer.
- Real-time transport is Socket.IO; WebRTC signalling runs over the authenticated socket (no PeerJS). The server holds all two-sided consent state; the client only mirrors it.
- Messages are relayed, never stored, capped at 2,000 characters, and rendered as plain text (no HTML escaping on the server).
- Report reasons: Harassment, Inappropriate content, Spam, Underage, Other. Reports are stored with chat metadata, auto-block the pair, and feed the admin moderation queue; several distinct reporters suspend an account automatically.
- Frontend: React 19 + Vite 7 (ES2020 bundle plus a legacy bundle for old Android WebViews), lucide-react icons, English and Hindi.

## Brand Commitments

- The name is **LpuTV** (renamed from UniConnect on 2026-10-21). It is no longer campus-neutral; avoid adding further single-university references beyond the name.
- The product is described as a non-profit student project running on a free-tier server (wake-up overlay copy).

## Evidence on Hand

- There are no real usage figures, testimonials, or press.
- **Do not claim:** user counts (including "30k+"), "encrypted" chat, or "safe" as a guarantee. "Verified" may only be shown on accounts that signed in with a Google account from a verified domain; guests are unverified.
- True claims: anonymous by default, no sign-up, 10-minute chats, mutual opt-in before identities are revealed, optional video, friends and direct messages, Android app.

## Product Principles

1. Seconds to a conversation. Every step before the first message has to justify itself.
2. Consent is mutual and visible. Enjoy, friend, extend, and video all need both sides, and the UI always shows whose move it is.
3. Anonymous until both people choose otherwise.
4. Only true claims. Never fake scale or safety.
5. Phone-first. The chat and video screens are where people actually spend their time.

## Accessibility & Inclusion

Gender choice includes Other. No specific standard has been set; aim for WCAG AA contrast and touch targets of at least 44px.
