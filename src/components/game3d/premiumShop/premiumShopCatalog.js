/**
 * Game 3D Premium Store content / design mock catalog.
 * NO prices, balances, grants, payment entitlements, or gameplay buffs are live.
 * product IDs are stable UI references for a future server-authoritative catalog.
 */
export const STORE_TABS = [
  { id:'featured', label:'Featured', icon:'✦', title:'Featured Offers', subtitle:'The latest arrivals at the Soul Emporium.', theme:'moonlight' },
  { id:'costumes', label:'Costumes', icon:'◇', title:'The Regalia Gallery', subtitle:'Build a signature silhouette with outfits, cloaks and aura skins.', theme:'violet' },
  { id:'companions', label:'Companions', icon:'🐺', title:'Soulbound Companions', subtitle:'Expressions, recolors and spirit styles for your companions.', theme:'frost' },
  { id:'mounts', label:'Mounts', icon:'♞', title:'The Spirit Stables', subtitle:'Mount appearances, saddles, trails and ceremonial armor.', theme:'turquoise' },
  { id:'progression', label:'Progression', icon:'✧', title:'The Wayfarer Archive', subtitle:'Optional time-saving conveniences and progression aids.', theme:'sage' },
  { id:'forge', label:'Forge', icon:'⚒', title:'The Starforge', subtitle:'Enchantment, combining and ascending support concepts.', theme:'ember' },
  { id:'passes', label:'Passes', icon:'▣', title:'Season Chronicle', subtitle:'A season-by-season reward journey, designed for clear preview.', theme:'gold' },
  { id:'bundles', label:'Bundles', icon:'✶', title:'Collections & Bundles', subtitle:'Starter collections, themed sets and curated value packs.', theme:'amber' },
  { id:'currency', label:'Currency', icon:'◈', title:'Crystal Treasury', subtitle:'Premium currency, receipts and redemption—pending payment integration.', theme:'crystal' },
];

export const STORE_OFFERS = [
  { id:'moonveil-regalia', tab:'costumes', name:'Moonveil Regalia', tag:'MYTHIC • COSMETIC SET', icon:'⚔', kind:'Cosmetic', note:'A complete midnight-silver warrior wardrobe. Hero artwork is a temporary placeholder.', effect:'Appearance only; no combat benefit.', tone:'moonlight', art:'hero' },
  { id:'will-aura-azure', tab:'costumes', name:'Will Aura: Azure Mist', tag:'AURA SKIN', icon:'✧', kind:'Cosmetic', note:'An ethereal Will aura with cool blue mist and silver sparks.', effect:'Visual effect only.', tone:'crystal' },
  { id:'celestial-cloak', tab:'costumes', name:'Celestial Cloak', tag:'CLOAK SKIN', icon:'♧', kind:'Cosmetic', note:'Layered silver fabric with moving starlight embroidery.', effect:'Visual effect only.', tone:'violet' },
  { id:'soulblade-finish', tab:'costumes', name:'Moonsteel Weapon Finish', tag:'WEAPON SKIN', icon:'⚔', kind:'Cosmetic', note:'A metallic finish for eligible weapon forms.', effect:'Visual effect only.', tone:'moonlight' },
  { id:'wolf-soulskin', tab:'companions', name:'Frostbound Wolf Skin', tag:'COMPANION SKIN', icon:'🐺', kind:'Cosmetic', note:'Silver-white fur with a segmented blue Will aura.', effect:'Appearance only.', tone:'frost', art:'wolf' },
  { id:'soulbond-nectar', tab:'companions', name:'Soulbond Nectar', tag:'COMPANION GROWTH', icon:'❖', kind:'Growth concept', note:'A proposed limited-duration companion XP boost.', effect:'Proposed +50% companion XP for 2h; not implemented.', tone:'crystal' },
  { id:'companion-halo', tab:'companions', name:'Guardian Halo', tag:'COMPANION FX', icon:'◉', kind:'Cosmetic', note:'A luminous ring for your equipped companion.', effect:'Visual effect only.', tone:'frost' },
  { id:'companion-emotes', tab:'companions', name:'Spirit Companion Emotes', tag:'ANIMATION PACK', icon:'✺', kind:'Cosmetic', note:'Optional wolf and companion greeting animations.', effect:'Animation only.', tone:'violet' },
  { id:'spectral-steed', tab:'mounts', name:'Mooncrest Steed', tag:'MOUNT SKIN', icon:'♞', kind:'Cosmetic', note:'Ceremonial steed with blue-white light trails.', effect:'Appearance only; default mount speed.', tone:'turquoise' },
  { id:'wolf-mount-skin', tab:'mounts', name:'Spirit Wolf Mount', tag:'MOUNT SKIN', icon:'🐺', kind:'Cosmetic', note:'A spectral mount appearance with floating blue fur highlights.', effect:'Appearance only.', tone:'frost', art:'wolf' },
  { id:'trail-wisps', tab:'mounts', name:'Starlit Hoofprints', tag:'TRAIL FX', icon:'✧', kind:'Cosmetic', note:'Blue-silver footprints fade behind the mount.', effect:'Visual effect only.', tone:'crystal' },
  { id:'mount-barding', tab:'mounts', name:'Silver Barding', tag:'MOUNT ARMOR SKIN', icon:'◇', kind:'Cosmetic', note:'Detailed ceremonial plating for compatible mounts.', effect:'Appearance only.', tone:'moonlight' },
  { id:'travelers-insight', tab:'progression', name:'Traveler’s Insight', tag:'EXPERIENCE BOOST', icon:'✎', kind:'Progression concept', note:'A proposed temporary XP booster for progression sessions.', effect:'Proposed +50% XP for 2h; not implemented.', tone:'crystal' },
  { id:'rested-time', tab:'progression', name:'Rested Timekeeper', tag:'TIME SAVER', icon:'⌛', kind:'Progression concept', note:'A convenience option that may extend rested XP duration.', effect:'Requires future progression rules and balance review.', tone:'sage' },
  { id:'wayfarer-supplies', tab:'progression', name:'Wayfarer Supplies', tag:'UTILITY BUNDLE', icon:'✦', kind:'Convenience concept', note:'Consumable quality-of-life items, subject to approved balance.', effect:'No benefits active until implemented.', tone:'turquoise' },
  { id:'artisan-favor', tab:'forge', name:'Artisan’s Favor', tag:'ENCHANT AID', icon:'⚒', kind:'Forge concept', note:'Proposed limited enchantment-chance assistance.', effect:'Concept only; no percentage or guarantee is active.', tone:'ember' },
  { id:'fusion-catalyst', tab:'forge', name:'Fusion Catalyst', tag:'COMBINE AID', icon:'✥', kind:'Forge concept', note:'Proposed combining support consumable.', effect:'Requires integration with Combine and server-side chance disclosure.', tone:'crystal' },
  { id:'ascension-seal', tab:'forge', name:'Ascension Seal', tag:'STAGE AID', icon:'◇', kind:'Forge concept', note:'Proposed stage/Ascend safeguard concept.', effect:'Does not currently alter stage or enchant chances.', tone:'gold' },
  { id:'forge-resonance', tab:'forge', name:'Forge Resonance', tag:'SERVICE COSMETIC', icon:'✧', kind:'Cosmetic', note:'Customize forge animation and sparks without adjusting odds.', effect:'Visual effect only.', tone:'ember' },
  { id:'season-chronicle', tab:'passes', name:'Chronicle Pass', tag:'SEASON PASS', icon:'▣', kind:'Pass concept', note:'A future season track with transparent free and premium rewards.', effect:'No active subscription, renewal or reward entitlement.', tone:'gold' },
  { id:'founder-collection', tab:'bundles', name:'Starter Collection', tag:'WELCOME BUNDLE', icon:'▤', kind:'Bundle concept', note:'An optional introductory collection of wardrobe skins and utility concepts.', effect:'Bundle contents subject to backend approval.', tone:'amber' },
  { id:'moonlit-ensemble', tab:'bundles', name:'Moonlit Ensemble', tag:'COSMETIC BUNDLE', icon:'✺', kind:'Cosmetic', note:'Coordinated cape, aura and weapon finish appearance set.', effect:'Appearance only.', tone:'violet' },
  { id:'soulbound-duo', tab:'bundles', name:'Soulbound Duo', tag:'COMPANION BUNDLE', icon:'🐺', kind:'Cosmetic', note:'Companion look and matching mount trail.', effect:'Appearance only.', tone:'frost' },
];
// Full-looking shop shelves without fictitious account balances or transactions.
// Entries are PREVIEW catalog concepts. They are not sellable until the server publishes
// verified SKUs, regional prices, ownership rules, and a secure entitlement pipeline.
// Each row uses [name, type, description, rarity, sampleCrystals, symbol, artHint].
const SHELF_BLUEPRINTS = {
  costumes: [
    ['Blossom Veil Attire','Outfit','Silken petals and silver embroidery.','epic',1480,'❀','samurai'],
    ['Nightfall Wanderer','Outfit','Layered midnight traveler outfit.','rare',780,'✦','samurai'],
    ['Moonsteel Sword Finish','Weapon skin','Moonlit blue edges for eligible blades.','epic',880,'⚔'],
    ['Frostweave Cloak','Cloak','Silver-white cloak with mist trails.','legendary',1280,'❄'],
    ['Will Halo: Dawn','Aura','Pale sunlit aura for your avatar.','rare',680,'◎'],
    ['Lotus Hair Ornament','Accessory','Gold and pearl floral hairpiece.','rare',480,'❀'],
    ['Crimson Night Robes','Outfit','Rich red silk and charcoal detailing.','epic',1180,'♜','samurai'],
    ['Cloudstep Boots','Footwear','Ornamental high-top traveling boots.','rare',520,'✧'],
    ['Spirit Feather Cape','Cloak','Soft white cape with feather accents.','epic',980,'༄'],
    ['Cerulean Eyes Effect','Face cosmetic','Blue shimmer appearance effect.','common',280,'◉'],
    ['Eclipse Regalia','Outfit','Formal armor with lunar accents.','legendary',1880,'☾','samurai'],
    ['Silver Moon Mask','Headwear','Moon-carved ceremonial facewear.','epic',760,'◈'],
    ['Falling Petal Trail','Aura','Petals swirl during movement.','rare',580,'❀'],
    ['Imperial Silk Set','Outfit','Ceremonial ivory and blue layering.','epic',1380,'♛','samurai'],
    ['Starlit Bracers','Accessory','Silver-trimmed ornamental forearms.','rare',440,'✥'],
    ['Celestial Crown','Headwear','A restrained gilded headpiece.','legendary',1020,'✺'],
  ],
  companions: [
    ['Azure Spirit Wolf','Companion skin','A luminous companion with icy fur.','legendary',1280,'🐺','wolf'],
    ['Lotus Bamboo Cub','Companion skin','Playful panda-inspired companion look.','epic',680,'◉'],
    ['Spirit Fox Companion','Companion skin','A celestial fox with silver tails.','epic',980,'✺'],
    ['Cloud Bunny','Companion skin','Soft glowing forest companion style.','rare',420,'◌'],
    ['Blossom Crane','Companion skin','Elegant pink and white crane spirit.','rare',640,'✧'],
    ['Wolf Emote Collection','Emote pack','Playful bow, howl and greeting motions.','epic',690,'🐺','wolf'],
    ['Companion Nameplate','Cosmetic','Decorative blue nameplate frame.','common',210,'▣'],
    ['Moonlit Pawprints','Visual effect','Footprints with silver star sparks.','rare',520,'✦'],
    ['Guardian Spirit Ring','Visual effect','Soft halo surrounding your companion.','rare',550,'◉'],
    ['Bamboo Treat Satchel','Growth concept','Proposed companion growth convenience.','rare',340,'✿'],
    ['Frostfang Collar','Appearance','Ice-blue collar and jewel accent.','rare',420,'◇'],
    ['Wolf Bond Ribbon','Appearance','Silver ceremonial ribbon for spirits.','rare',380,'༄'],
    ['Companion Rest Token','Convenience concept','Proposed companion rest assistance.','rare',450,'☾'],
    ['Spirit Lantern Pet','Companion skin','Small floating lantern companion.','epic',760,'✧'],
    ['Aurora Cub','Companion skin','An arctic-blue cub with star accents.','epic',980,'❄'],
    ['Celestial Moth','Companion skin','Moonlight wings and drifting dust.','rare',520,'✦'],
  ],
  mounts: [
    ['Jadewing Phoenix','Mount skin','A radiant bird mount with light trails.','legendary',1680,'✶'],
    ['Silver Wolf Mount','Mount skin','Blue-white spectral wolf appearance.','legendary',1480,'🐺','wolf'],
    ['Cloud Runner Steed','Mount skin','Ivory horse with cloudlike hair.','epic',1180,'♞'],
    ['Moonlit Stag','Mount skin','Antlered woodland spirit with blue light.','epic',980,'♘'],
    ['Azure Crane Mount','Mount skin','Floating crane-inspired traveling mount.','epic',1280,'✧'],
    ['Starfall Hooves','Trail effect','Gentle sparks beneath the mount.','rare',480,'✦'],
    ['Royal Barding','Mount armor skin','Decorative silver ceremonial mount armor.','rare',680,'♜'],
    ['Frostmane Tiger','Mount skin','Striped frost-blue mount appearance.','legendary',1480,'❄'],
    ['Petalstep Trail','Trail effect','A drifting cherry blossom path.','rare',520,'❀'],
    ['Eclipse Saddle','Saddle skin','Dark steel and gold saddle finish.','rare',490,'◇'],
    ['Celestial Horns','Mount accessory','Luminous silver horns for compatible mounts.','epic',640,'✶'],
    ['Nightmare Lantern','Mount accessory','Soft moonlit carriage lantern.','rare',330,'✧'],
    ['Spirit Stables Banner','Cosmetic','Decorative personal stable banner.','common',280,'▣'],
    ['Dawnflight Wings','Mount skin','Pale shimmering winged mount style.','legendary',1690,'༄'],
    ['Azure Saddlecloth','Mount accessory','Rich ocean-blue embroidered saddlecloth.','rare',420,'♞'],
    ['Blue Comet Trail','Trail effect','An icy line of light while moving.','epic',720,'☄'],
  ],
  progression: [
    ['Adventurer XP Scroll','Experience concept','Proposed short-duration experience gain aid.','rare',90,'✎'],
    ['Companion Growth Scroll','Growth concept','Proposed temporary bond experience aid.','rare',120,'🐺'],
    ['Journey Milestone Token','Convenience concept','Potential one-time journey convenience.','rare',180,'✦'],
    ['Wayfarer Rest Kit','Rest concept','Proposed rested-experience support.','rare',130,'⌛'],
    ['Scholar’s Mark','Experience concept','Concept assistance for quest progression.','epic',220,'✧'],
    ['Explorer’s Compass','Convenience concept','Potential extra navigation convenience.','rare',140,'◈'],
    ['Dungeon Journey Pack','Convenience concept','Proposed dungeon preparation supplies.','epic',260,'▣'],
    ['Travel Chronicle','Experience concept','Optional timed progression assistance.','rare',190,'▤'],
    ['Companion Bond Satchel','Growth concept','Proposed companion affinity aid.','epic',230,'◉'],
    ['Wayfarer Token','Convenience concept','Proposed account-bound utility token.','rare',110,'✥'],
    ['Training Journal','Experience concept','Concept for training-session efficiency.','epic',290,'✎'],
    ['Campfire Rest Voucher','Rest concept','Proposed recovery/rest convenience.','rare',150,'❖'],
    ['Exploration Notes','Convenience concept','Future optional map annotation pack.','rare',170,'⌖'],
    ['Bondkeeper Notes','Growth concept','Proposed companion support collectible.','rare',130,'🐺'],
    ['Quest Lantern','Convenience concept','Future optional objective guidance cosmetic.','rare',230,'✧'],
    ['Rested Spirit Seal','Rest concept','Future limited rest effect proposal.','epic',280,'◇'],
  ],
  forge: [
    ['Refinement Stone','Forge concept','Proposed refining assistance material.','rare',320,'💎'],
    ['Fusion Crystal','Combine concept','Proposed catalyst for equipment combining.','epic',180,'◇'],
    ['Artisan’s Token','Enchant concept','Future enhancement support collectible.','rare',180,'⚒'],
    ['Silver Tempering Ore','Material concept','Possible crafting and tempering material.','rare',120,'▤'],
    ['Ascendant Sigil','Ascend concept','Proposed gear-stage assistance token.','legendary',420,'✦'],
    ['Celestial Alloy','Material concept','High-tier refining material proposal.','epic',240,'▱'],
    ['Forgemaster Scroll','Enchant concept','Proposed enchant enhancement aid.','epic',280,'✎'],
    ['Moonsteel Ingot','Material concept','Moonlit crafting metal proposal.','rare',160,'▰'],
    ['Artisan’s Charm','Enchant concept','Future premium forge support, unimplemented.','rare',180,'❖'],
    ['Combining Emblem','Combine concept','Proposed combination aid.','epic',260,'◈'],
    ['Stagekeeper Seal','Ascend concept','Future stage-upgrade safeguard idea.','epic',360,'✥'],
    ['Aether Shard','Material concept','Luminescent high-tier material concept.','rare',140,'◆'],
    ['Blacksmith Fire Skin','Forge cosmetic','Changes forge visuals, not success odds.','rare',540,'♨'],
    ['Moonforge Sparks','Forge cosmetic','Blue ceremonial spark effect.','rare',480,'✧'],
    ['Crystal Anvil Look','Forge cosmetic','Custom forge appearance theme.','epic',680,'⚒'],
    ['Master Crafting Bundle','Bundle concept','Possible material assortment, unimplemented.','epic',720,'▣'],
  ],
  passes: [
    ['Season Chronicle Book','Pass concept','Proposed seasonal reward track access.','legendary',980,'▣','passBanner'],
    ['Silver Chapter Banner','Pass cosmetic','A seasonal banner reward look.','rare',380,'༄','passBanner'],
    ['Moonlight Outfit Reward','Pass cosmetic','A ceremonial outfit concept.','epic',680,'♛','samurai'],
    ['Azure Chapter Aura','Pass cosmetic','Seasonal blue aura variation.','rare',420,'✧'],
    ['Wanderer Profile Crest','Pass cosmetic','Ornate seasonal profile frame.','rare',260,'◈'],
    ['Petal Festival Emote','Pass cosmetic','Seasonal falling-petal gesture.','rare',340,'❀'],
    ['Spirit Wolf Banner','Pass cosmetic','A wolf-patterned banner design.','rare',380,'🐺','wolf'],
    ['Seasonal Mount Barding','Pass cosmetic','Special seasonal mount trim.','epic',540,'♞'],
    ['Moonlit Footprint FX','Pass cosmetic','Soft moonlit walking trail.','rare',320,'✦'],
    ['Dawn Journey Badge','Pass cosmetic','Commemorative season badge.','common',160,'◇'],
    ['Sky Lantern Emote','Pass cosmetic','A floating lantern interaction.','rare',390,'✧'],
    ['Crystal Chronicle Frame','Pass cosmetic','Seasonal crystalline avatar frame.','epic',520,'▣'],
    ['Sakura Chapter Theme','Pass cosmetic','Pink garden and nightfall decoration.','epic',580,'❀'],
    ['Moonrise Title Style','Pass cosmetic','Seasonal display title treatment.','rare',240,'☾'],
    ['Spirit Trail Finish','Pass cosmetic','A ceremonial moving trail.','epic',560,'✺'],
    ['Season Memory Card','Pass cosmetic','Art collectible tied to season.','common',180,'▤'],
  ],
  bundles: [
    ['Growth Collection','Bundle concept','Proposed early progression starter pack.','epic',990,'▣','starterBanner'],
    ['Elite Value Collection','Bundle concept','Curated selection of popular store concepts.','legendary',1380,'▤','starterBanner'],
    ['Wolf and Wanderer','Cosmetic bundle','Matching wolf look and traveler apparel.','epic',1280,'🐺','wolf'],
    ['Moonlit Weapon Set','Cosmetic bundle','Coordinated moonlit weapon finishes.','epic',880,'⚔'],
    ['Frostbound Traveler','Cosmetic bundle','Frost cloak, boots and decorative aura.','epic',1080,'❄','samurai'],
    ['Sakura Festival Box','Cosmetic bundle','Blossom costumes and decor concepts.','epic',1180,'❀','starterBanner'],
    ['Silver Stables Collection','Cosmetic bundle','Horse barding, saddle and trails.','epic',920,'♞'],
    ['Celestial Companion Box','Cosmetic bundle','Multiple spirit companion appearances.','legendary',1420,'◉','wolf'],
    ['Wanderer Starter Chest','Bundle concept','Proposed beginner-friendly collection.','rare',480,'▤','starterBanner'],
    ['Aura Palette Bundle','Cosmetic bundle','Three matching Will aura styles.','epic',760,'✧'],
    ['Chronicle Collector Set','Cosmetic bundle','Book, crest and seasonal banner concepts.','epic',890,'▣','passBanner'],
    ['Blue Lotus Lookbook','Cosmetic bundle','Floral hair, jewelry and outfit styling.','epic',940,'❀'],
    ['Twin Spirits Package','Cosmetic bundle','Paired mount and companion looks.','legendary',1550,'✶','wolf'],
    ['Moonsteel Collection','Cosmetic bundle','Weapon and armor cosmetic combination.','epic',1120,'⚔'],
    ['Cloudstep Traveler Pack','Cosmetic bundle','Footsteps and cloak appearance pack.','rare',680,'☁'],
    ['Founders’ Relic Collection','Cosmetic bundle','Commemorative early supporter cosmetics.','legendary',1740,'✥','starterBanner'],
  ],
  currency: [
    ['Traveler Crystal Pouch','Currency concept','Future small premium-currency purchase package.','common',null,'💎'],
    ['Wanderer Crystal Cache','Currency concept','Future entry crystal bundle.','common',null,'◇'],
    ['Apprentice Crystal Satchel','Currency concept','Future mid-size crystal package.','rare',null,'◈'],
    ['Wayfarer Crystal Coffer','Currency concept','Future crystal purchase option.','rare',null,'▣'],
    ['Moonlit Crystal Box','Currency concept','Potential account-bound crystal package.','rare',null,'✧'],
    ['Celestial Crystal Vault','Currency concept','Potential larger crystal package.','epic',null,'✥'],
    ['Lunar Crystal Bundle','Currency concept','Future premium-currency offering.','rare',null,'☾'],
    ['Azure Crystal Bundle','Currency concept','Future premium-currency offering.','rare',null,'◆'],
    ['Silver Exchange Overview','Information','Future wallet exchange information screen.','common',null,'◉'],
    ['Account Wallet Details','Information','Placeholder for a verified premium wallet.','common',null,'▤'],
    ['Purchase History','Information','Future server-verified transaction receipts.','common',null,'▣'],
    ['Redeem Code Center','Information','Future server-validated code redemption.','common',null,'✦'],
    ['Season Currency Info','Information','Planned season-token details and policies.','common',null,'✧'],
    ['Refund and Support','Information','Store contact and refund policy location.','common',null,'♧'],
    ['Regional Pricing Details','Information','Prices supplied by storefront and region.','common',null,'◈'],
  ],
};
const PRICES_BY_ORIGINAL_ID = {
 'moonveil-regalia':1800,'will-aura-azure':600,'celestial-cloak':980,
 'soulblade-finish':880,'wolf-soulskin':1280,'soulbond-nectar':120,
 'companion-halo':560,'companion-emotes':480,'spectral-steed':1680,
 'wolf-mount-skin':1480,'trail-wisps':520,'mount-barding':580,
 'travelers-insight':90,'rested-time':240,'wayfarer-supplies':320,
 'artisan-favor':180,'fusion-catalyst':180,'ascension-seal':220,
 'forge-resonance':620,'season-chronicle':980,'founder-collection':720,
 'moonlit-ensemble':1480,'soulbound-duo':1280
};
const featuredIDs = [
 'moonveil-regalia','wolf-soulskin','travelers-insight','fusion-catalyst','soulbond-nectar',
 'will-aura-azure','spectral-steed','artisan-favor','ascension-seal','founder-collection',
 'celestial-cloak','season-chronicle','mount-barding','companion-halo','moonlit-ensemble',
 'blossom-veil-attire','azure-spirit-wolf','jadewing-phoenix','refinement-stone','elite-value-collection'
];
const slug = text => text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const shelfExtras = Object.entries(SHELF_BLUEPRINTS).flatMap(([tab,rows]) => rows.map(([name,type,desc,rarity,price,icon,art],idx) => ({
 id:slug(name),tab,name,type,desc,rarity,kind:type,
 tag:type.toUpperCase(),note:desc,
 previewPrice:price,priceLabel:price==null?'USD TBD':null,
 icon,art:art||null,tone:STORE_TABS.find(x=>x.id===tab)?.theme||'moonlight',
 isPlaceholder:true,shelfIndex:idx
})));
export const STORE_CATALOG = [
 ...STORE_OFFERS.map(offer=>({
  ...offer,rarity:offer.tag.includes('MYTHIC')?'mythic':offer.tag.includes('SEASON')?'legendary':'epic',
  type:offer.kind||'Cosmetic',previewPrice:PRICES_BY_ORIGINAL_ID[offer.id]??null,
  priceLabel:offer.tab==='currency'?'USD TBD':null,isPlaceholder:false
 })),
 ...shelfExtras
];
export const getTabOffers = (id) => id==='featured'
 ? featuredIDs.map(key=>STORE_CATALOG.find(offer=>offer.id===key)).filter(Boolean)
 : STORE_CATALOG.filter(offer=>offer.tab===id);
export const getOffer = id => STORE_CATALOG.find(offer=>offer.id===id);
export const STORE_RARITIES = ['all','common','rare','epic','legendary','mythic'];
export const getAvailableTypes = tab => [...new Set(getTabOffers(tab).map(x=>x.type))].sort();

export const STORE_ART = Object.freeze({
  // Temporary user-approved concept crops hosted in the matching Atom X Eve Base44 media library.
  // Only art is used from these images; titles, prices and controls remain native.
  samurai:'https://media.base44.com/images/public/6876751a602125f45f1861b9/1eb6aa88d_store_samurai.jpg',
  wolf:'https://media.base44.com/images/public/6876751a602125f45f1861b9/b485253b0_store_wolf_clean.jpg',
  passBanner:'https://media.base44.com/images/public/6876751a602125f45f1861b9/d13c363f9_store_pass_book.jpg',
  starterBanner:'https://media.base44.com/images/public/6876751a602125f45f1861b9/4ba773067_store_starter_chest.jpg',
  companionBanner:'https://media.base44.com/images/public/6876751a602125f45f1861b9/4a94147da_store_mount_wolf.jpg',
  scenery:'/game3d/store/soul-emporium-hero-placeholder.svg',
});
