---
name: LpuTV
description: A coin-op photo booth for conversation. Two strangers, one booth, a countdown.
colors:
  curtain-red: "#a3161a"
  curtain-deep: "#4f080b"
  curtain-mid: "#7f0f14"
  curtain-hi: "#c9332c"
  alert: "#f0604f"
  booth: "#151110"
  booth-2: "#1e1816"
  booth-3: "#2a221f"
  booth-line: "#3b312c"
  strip-paper: "#fbfaf6"
  paper-2: "#ece8e0"
  emulsion-silver: "#8f8b84"
  chrome: "#c9c4bb"
  ink: "#151110"
  ink-2: "#4e4741"
  tungsten-lamp: "#ffb547"
  live: "#4cc984"
  text: "#f1ebe3"
  text-2: "#bdb4aa"
  text-3: "#958c84"
typography:
  display:
    fontFamily: "Big Shoulders Display, Archivo Variable, sans-serif"
    fontSize: "clamp(76px, 23vw, 124px)"
    fontWeight: 800
    lineHeight: 0.88
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Big Shoulders Display, Archivo Variable, sans-serif"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: 0.88
  title:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.08em"
rounded:
  control: "4px"
  plate: "6px"
  bubble: "14px"
spacing:
  unit: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  xxl: "64px"
components:
  button-go:
    backgroundColor: "{colors.curtain-red}"
    textColor: "{colors.strip-paper}"
    typography: "{typography.headline}"
    rounded: "{rounded.control}"
    height: "64px"
  button-go-hover:
    backgroundColor: "{colors.curtain-hi}"
  button-red:
    backgroundColor: "{colors.curtain-red}"
    textColor: "{colors.strip-paper}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 16px"
  button-quiet:
    backgroundColor: "{colors.booth-3}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 16px"
  button-lamp:
    backgroundColor: "{colors.tungsten-lamp}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
  push-button:
    backgroundColor: "{colors.strip-paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "52px"
  push-button-checked:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.strip-paper}"
  plate:
    backgroundColor: "{colors.strip-paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "28px 24px 20px"
  bubble-me:
    backgroundColor: "{colors.curtain-red}"
    textColor: "{colors.strip-paper}"
    rounded: "{rounded.bubble}"
    padding: "10px 14px 8px"
  bubble-partner:
    backgroundColor: "{colors.booth-3}"
    textColor: "{colors.text}"
    rounded: "{rounded.bubble}"
    padding: "10px 14px 8px"
  input:
    backgroundColor: "{colors.booth}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    height: "48px"
---

# Design System: LpuTV

## Overview

**Creative North Star: "The Photo Booth"**

LpuTV is a coin-op photo booth for conversation. Outside the booth is a pleated red curtain, with an enamel instruction plate and a delivery slot that feeds a four-frame strip. Inside is a warm near-black room lit by one tungsten lamp. Every screen sits on one side of that curtain or the other. The landing page is the booth's exterior. The dashboard, matching, chat and video screens are its interior.

The mechanism is the identity. Strangers are **latent prints**: fogged silver frames with a "?" until both people accept the friend request. Then the print **develops** into crisp initials. A match fires the booth's **flash**. The timer is the booth's countdown lamp. The rest of the interior stays quiet and readable, because the chat is where people actually spend their time.

**Key Characteristics:**
- Two inks do the work: curtain red and strip paper/silver. Tungsten amber is the only warm light. Green appears only for live/online.
- Condensed uppercase signage (Big Shoulders Display) for headings, and a workhorse grotesque (Archivo) for everything people read.
- Controls are physical: enamel plates with screw heads, square push-buttons that press in, and a big red button with a weighted bottom edge.
- One 4px unit across frames, borders and spacing.
- Motion grammar: flash, develop, feed (the sample strip rolls slowly out of the slot, 56s per loop). Nothing else animates for show.

## Colors

A committed two-ink palette: curtain red owns whole regions on the exterior, and a warm near-black owns the interior.

### Primary
- **Curtain Red** (#a3161a): the curtain, the Step In button, the user's own chat bubbles, and the red half of the wordmark. Pleats are drawn from Curtain Deep (#4f080b), Curtain Mid (#7f0f14) and Curtain Highlight (#c9332c). Highlight is also the hover state for red buttons.

### Secondary
- **Tungsten Lamp** (#ffb547): the booth's single light. Used for the ready lamp, the countdown numerals, focus rings, text selection, the caret, consent-rail progress, and any "your move" action (Me too, Accept, Extend).

### Tertiary
- **Live Green** (#4cc984): online dots and the "Saved" confirmation only.
- **Alert** (#f0604f): low-time timer, muted mic or camera, and End call. This is the readable on-dark version of red.

### Neutral
- **Booth Black** (#151110): interior ground, and the ink on paper.
- **Booth 2 / Booth 3** (#1e1816 / #2a221f): the chat header and composer, and the partner's bubbles and quiet buttons.
- **Booth Line** (#3b312c): every hairline divider and quiet border on dark.
- **Strip Paper** (#fbfaf6): enamel plates, print borders, video frames, push-buttons.
- **Paper 2** (#ece8e0): push-button bottom edges and paper hover.
- **Emulsion Silver** (#8f8b84): print and sample-frame emulsion, drawn as a radial gradient from #b9b4ab to #5f5b56.
- **Chrome** (#c9c4bb): the plate's outer ring, the curtain rod, the slot surround.
- **Ink 2** (#4e4741): secondary text on paper.
- **Text / Text 2 / Text 3** (#f1ebe3 / #bdb4aa / #958c84): primary, secondary and tertiary text on dark. All pass AA on Booth Black.

### Named Rules
**The Two-Ink Rule.** Curtain red and paper/silver carry every surface. A third hue may only mean live/online (green) or alarm (Alert). Never add a decorative accent.

**The One Light Rule.** Tungsten amber is the only warm light in the booth. If something glows, it is a lamp.

## Typography

**Display Font:** Big Shoulders Display 800/900, self-hosted via @fontsource (fallback: Archivo)
**Body Font:** Archivo Variable, self-hosted via @fontsource-variable (fallback: system-ui)

**Character:** Big Shoulders is the booth's enamel signage: condensed, uppercase and loud. Archivo is the printed instruction text: plain, sturdy, highly legible on a phone at night.

### Hierarchy
- **Display** (800, clamp(76px, 23vw, 124px), 0.88): the landing wordmark only.
- **Headline** (800, 40–104px by screen, 0.88, uppercase): screen titles such as Finding someone, Friends, Random chat, Video call, Report.
- **Title** (700, 16–20px): names, list rows, step titles.
- **Body** (400, 16–17px, 1.45–1.5): promises, help text, chat messages. Keep to 34–52ch.
- **Label** (700, 12px, 0.08em, uppercase): printed instruction labels. There is one size everywhere: field labels, plate footers, "Sample strip".

### Named Rules
**The Constant Label Rule.** Every printed label is 12px / 700 / 0.08em / uppercase. Labels never sit above a heading as an eyebrow.

**The Signage-Only Rule.** Big Shoulders is used only for headings and numerals (timer, wake-up countdown, step numbers). Body copy and messages stay in Archivo.

## Layout

Phone-first, single column. Gutters are 20px on mobile and 40px at 900px and up. The container is 1040px for the dashboard and how-it-works section. The chat is a 760px column with booth-line edges, and goes full-bleed under 520px.

- **Landing:** the curtain fills the viewport. The plate (max 420px, or 460px on desktop) is centred, with the slot and strip below it. At 900px and up, the plate and strip sit side by side with a 72px gap. How it works follows on Booth Black, as 4 steps in a column on mobile and a 4-column row on desktop.
- **Dashboard:** profile, then the Step In plate, then friends. Two equal columns at 900px and up.
- **Chat:** header, consent rail, optional video and controls, scrolling log, composer. The composer respects safe-area-inset-bottom.
- **Rhythm:** a 4px unit. Steps are 8, 12, 16, 24, 40 and 64px, with more space above a heading than below it.

## Elevation & Depth

Depth is physical, not ambient. Plates are objects mounted on the curtain. Prints are photos lying on a surface. Interior surfaces are flat and separated by tone and hairlines.

### Shadow Vocabulary
- **Mounted plate** (`0 0 0 5px #c9c4bb, 0 0 0 7px #151110, 0 28px 56px -16px rgba(0,0,0,.7)`): a chrome ring, an ink edge and a real drop shadow.
- **Weighted button** (`inset 0 -5px 0 rgba(0,0,0,.3), 0 8px 20px -8px rgba(79,8,11,.6)`): Step In. Pressing moves it down 3px and shrinks the bottom edge.
- **Small button edge** (`inset 0 -3px 0 rgba(0,0,0,.28)`): red and lamp buttons.
- **Print** (`0 2px 6px rgba(0,0,0,.35)`): avatars.
- **Hanging strip** (`0 18px 30px -10px rgba(0,0,0,.65)`): the sample strip and video PiP.

### Named Rules
**The Flat Interior Rule.** Inside the booth, surfaces are flat tones divided by #3b312c hairlines. Shadows belong to objects (plates, prints, strips), never to layout containers.

## Shapes

Corners are nearly square. Controls use 4px. Plates use 6px with two screw heads in the top corners. Chat bubbles are the one soft shape (14px, with a 4px tail corner on the speaker's side). Prints use 2px with a 3px paper border. Push-buttons use 3px ink borders. Dividers are 1px hairlines, plus a 2px dashed paper rule in plate footers.

## Components

### Buttons
- **Go (Step In):** Curtain Red, 3px ink border, 64px tall, Big Shoulders 32px uppercase with an arrow icon, weighted bottom edge. Hover goes to Curtain Highlight, and press drops it 3px.
- **Red:** the primary small action (Send, Add friend, Accept video). 44px, 4px radius.
- **Lamp:** "Your move" actions where the other person is waiting (Me too, Accept friend, Extend).
- **Quiet:** booth-3 with a booth-line border, for secondary actions (Skip, Chat, Cancel, Decline).
- **Ghost:** text-2 with no fill, for Log out, Report and Dismiss.
- **Danger:** an Alert tint, for End call and pressed mute/camera toggles.
- All buttons are at least 44px, with icons from lucide-react at 18px.

### Push-buttons (gender)
Real radio inputs styled as square paper keys with a 3px ink border, laid out as a 3-column grid. The checked state inverts to ink with an inset top shadow, so it reads as pressed in.

### Enamel Plate
The paper card that carries the landing form, the dashboard's Step In, and modal dialogs. It has a chrome ring, an ink edge and screw heads. On the landing page a tungsten lamp is mounted at the top right.

### Print (avatar)
Initials in Big Shoulders 900 on silver emulsion inside a paper border. The `latent` state shows a blurred "?" with low contrast. On reveal, filter and opacity transition over 1400ms on an exponential ease-out (the develop).

### Consent Rail
A strip under the chat header. It shows two progress segments (Both enjoy, then Names revealed), one sentence saying whose move it is, and the one relevant action. Amber marks progress. It collapses to a single amber line once you're friends.

### Countdown Timer
Big Shoulders 24px tabular numerals in tungsten, labeled LEFT. Under 60 seconds the numerals turn Alert and pulse.

### Inputs
Booth-dark fill, booth-line border, 4px radius, 16px text so iOS doesn't zoom. Focus switches to a tungsten border with a 3px amber glow.

### Sample Strip
A paper strip with six frames of CC0 campus photos, silver-toned to grayscale and kept in `frontend/public/strip/` with the origin embedded in each file. Each frame carries an illustrative chat line or event chip (lamp-amber). It feeds down out of the delivery slot on a seamless 56s linear loop (two identical runs, translateY -50% to 0), pauses on hover, sits still under reduced motion, and fades out at the bottom with a mask. It is always captioned as an example. No photo shows a recognisable face.

### Flash
On every match, a full-screen warm white (#fffaf0) layer peaks at 8% of a 900ms ease-out, then fades. It is disabled under prefers-reduced-motion.

### Onboarding and consent
An enamel-plate dialog with three steps (booth rules, camera and mic explainer, consent). Consent uses square ink checkboxes (28px, 3px border) that invert to ink when ticked; the primary action stays red. Later sign-ups on the same device see only the consent step.

### Chips
Pill-shaped (18px radius, 36px tall) on booth-2 with a booth-line border. Selected chips fill with tungsten lamp and ink text. Used for interests and icebreaker prompts; the only rounded-pill element in the system.

### Toasts and banners
Toasts are paper slips at the bottom (ink text, lamp action button), stacked to three. The reconnecting banner is a full-width lamp strip above the chat header.

### Settings rows
Hairline-divided rows: title and one-line explanation on the left, control on the right (quiet button or a 64px switch that fills with lamp when on). Destructive actions use the danger button.

### Legal pages
Booth interior, 760px column, Big Shoulders title, Archivo body at 68ch. Tables collapse to stacked rows under 520px.

## Do's and Don'ts

### Do:
- **Do** keep the landing on the curtain, with the action inside the plate at thumb height.
- **Do** keep strip photos grayscale, faceless and CC0, with origin embedded in each file.
- **Do** show anonymous people as latent prints, and develop them only on mutual friend acceptance.
- **Do** say whose move it is in plain words whenever consent is pending.
- **Do** use the 12px label for every printed instruction, and lucide icons for every pictogram.
- **Do** theme browser surfaces: amber selection, caret and focus ring, and booth-line scrollbars.

### Don't:
- **Don't** claim user counts, "verified students", "encrypted" or "safe" (PRODUCT.md). Label demo content, like the sample strip.
- **Don't** add a kicker or eyebrow label above a heading.
- **Don't** use emoji or Unicode glyphs as icons.
- **Don't** bring back the old look: Space Mono everywhere, the near-black page with a neon-orange accent, or the grid overlay.
- **Don't** put shadows on interior layout containers. Only plates, prints and strips cast them.
