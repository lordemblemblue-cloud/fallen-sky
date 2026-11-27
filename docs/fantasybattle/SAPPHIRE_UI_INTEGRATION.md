# Fantasy Battle — Sapphire Sumi integration
All 48 UI IDs have dedicated render cases. UI text is live HTML; the vector panel backgrounds are reconstructed text-free templates, not pixel-perfect retouches of concept art.
 
## Preview
With the branch checked out, run npm install and npm run dev, then visit /fantasy-battle. Production stays Coming Soon until the existing release flag is deliberately enabled following QA. The other games are unchanged.
 
The title leads to setup, character creation, selection, loading and Sapphire Wilds. Loading waits for world restore acknowledgement. Escape opens/closes pause; C character, K skillbook, M map, L journal, I equipment. Normal encounters launch the existing archer battle on the 3D Sapphire Sanctuary; elite/boss encounters show entrance and introduction first. Battle rewards and level-ups open real progression screens, then resume the world. The map reads the actual world section registry, streamed encounter markers and player coordinates; new regions in that registry flow through the UI, but separate future maps need registration.
 
## State and scope
Guest data is localStorage, three validated slots, separate namespace. No fabricated saves, no login restoration, no new public server endpoints. Cloud saves are not implemented. The economy and skill thresholds are provisional prototype balancing. Additional companion rigs, cosmetic items, and relationship content are not authored; these menus display unavailable/empty states. Boss encounters currently reuse the archer opponent with scaled stats, not a distinct boss model.
 
## Artwork
The revised 48 text-free vector frames, eight live item/skill icons, six optimized WebP backgrounds (five original clean paintings and the original title scene crop) and four decorative illustration extracts are committed directly on this branch. No separate asset installation is required. See public/fantasybattle/sapphire and tests/fantasybattle-sapphire-art.test.mjs.
The original title painting uses the text-free scenic right portion; the left navigation and all labels are rendered independently. Major event/loading/title screens have cinematic backgrounds; pause, gameplay HUDs and small overlays preserve the active 3D scene. The quest, skill and acquisition artwork is decorative, not a claim about the player's character or equipped item. Exact individually painted text removal from all 48 full reference images remains a separate art pass.

## Validation
Run node --test tests/fantasybattle-adventure.test.mjs tests/fantasybattle-sapphire-art.test.mjs, npm run lint, npm run build. All 48 revised frame strings and 96 screen/art-policy combinations passed isolated structural checks; ten image blob hashes matched the locally verified WebP assets, and the asset commit added only the intended ten paths. The six isolated logic test groups passed in a JS harness with injected UUID implementation; the world JS body parsed with module imports stripped. All 48 dedicated cases confirmed. Full npm build/lint and WebGPU/WebGL browser testing were unavailable in the connector environment. Do not release until full QA.
 
Browser acceptance: no-save title; create/save/reload; corrupt slots; overwrite confirm/cancel; actual terrain and restored position; move/interact and all hotkeys; normal/elite/boss encounter paths, defeat/retry, victory and duplicate reward prevention; level up/allocate/skill unlock; quest acceptance/claim; loot, buy/sell, enhancement, crafting, healing, fast travel; dynamic map, notifications, responsive layouts; error recovery and return-to-title. Validate existing other game routes and Base44 security scanner.
