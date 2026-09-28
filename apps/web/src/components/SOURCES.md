# UI source components

This frontend intentionally composes verified third-party components from the visual source catalog supplied for the Network Outreach UI rebuild.

- ReactBits Orb: https://www.reactbits.dev/backgrounds/orb
  - upstream: https://github.com/DavidHDev/react-bits
  - vendored without visual redesign under `components/reactbits/Orb.*`
- ReactBits Grainient: https://www.reactbits.dev/backgrounds/grainient
  - upstream: https://github.com/DavidHDev/react-bits
  - vendored under `components/reactbits/Grainient.*`
- ReactBits Particles: https://www.reactbits.dev/backgrounds/particles
  - upstream: https://github.com/DavidHDev/react-bits
  - vendored under `components/reactbits/Particles.*`
- Aceternity World Map: https://ui.aceternity.com/components/world-map
  - source registry: https://ui.aceternity.com/registry/world-map.json
  - Vite adaptation under `components/aceternity/WorldMap.*`
- Cult UI Border Beam Button:
  - https://www.cult-ui.com/docs/components/border-beam-button
  - uses the MIT `border-beam` package by Jakub Antalik, imported directly rather than reimplemented.

Do not replace these effects with hand-invented approximations. Adapt only where required by the existing Vite/React application and preserve the Network Outreach business workflow.

The ReactBits Glow Cursor source remains vendored for reference but is intentionally not mounted in the application shell after screenshot QA showed the full-page trail reading as a visual artifact.
