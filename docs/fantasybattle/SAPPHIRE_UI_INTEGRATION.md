# Fantasy Battle — Sapphire Sumi integration
All 48 UI IDs have dedicated render cases. UI text is live HTML; the vector panel backgrounds are reconstructed text-free templates, not pixel-perfect retouches of concept art.
 
## Preview
With the branch checked out, run npm install and npm run dev, then visit /fantasy-battle. Production stays Coming Soon until the existing release flag is deliberately enabled following QA. The other games are unchanged.
 
The title leads to setup, character creation, selection, loading and Sapphire Wilds. Loading waits for world restore acknowledgement. Escape opens/closes pause; C character, K skillbook, M map, L journal, I equipment. Normal encounters launch the existing archer battle on the 3D Sapphire Sanctuary; elite/boss encounters show entrance and introduction first. Battle rewards and level-ups open real progression screens, then resume the world. The map reads the actual world section registry, streamed encounter markers and player coordinates; new regions in that registry flow through the UI, but separate future maps need registration.
 
## State and scope
Guest data is localStorage, three validated slots, separate namespace. No fabricated saves, no login restoration, no new public server endpoints. Cloud saves are not implemented. The economy and skill thresholds are provisional prototype balancing. Additional companion rigs, cosmetic items, and relationship content are not authored; these menus display unavailable/empty states. Boss encounters currently reuse the archer opponent with scaled stats, not a distinct boss model.
 
## Artwork
Extract the supplied Fantasy_Battle_Sapphire_Assets.zip at repo root and commit public/fantasybattle/sapphire and docs/fantasybattle/ui-manifest.json. It contains 48 text-free SVGs, five shared JPG backgrounds and seven component assets. The title CSS already points to sanctuary.jpg and has a hub-art fallback until the assets are installed. Runtime SVG generator produces text-free panels even without the external pack. Exact individually painted text removal from 48 reference screenshots remains a separate art pass.
 
## Validation
Run node --test tests/fantasybattle-adventure.test.mjs, npm run lint, npm run build. The six isolated logic test groups passed in a JS harness with injected UUID implementation; the world JS body parsed with module imports stripped. All 48 dedicated cases confirmed. Full npm build/lint and WebGPU/WebGL browser testing were unavailable in the connector environment. Do not release until full QA.
 
Browser acceptance: no-save title; create/save/reload; corrupt slots; overwrite confirm/cancel; actual terrain and restored position; move/interact and all hotkeys; normal/elite/boss encounter paths, defeat/retry, victory and duplicate reward prevention; level up/allocate/skill unlock; quest acceptance/claim; loot, buy/sell, enhancement, crafting, healing, fast travel; dynamic map, notifications, responsive layouts; error recovery and return-to-title. Validate existing other game routes and Base44 security scanner.
