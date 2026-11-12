import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X, ShoppingCart, Search, Eye, ChevronRight, Gem, ShieldCheck,
  SlidersHorizontal, RotateCcw, Check, Image as ImageIcon, LockKeyhole
} from 'lucide-react';
import {
  STORE_TABS, STORE_ART, getOffer, getTabOffers,
  STORE_RARITIES, getAvailableTypes
} from './premiumShopCatalog';
import './SoulEmporiumOverlay.css';

// Tab is a UI prototype. Sample crystal amounts are clearly marked PREVIEW,
// never paid prices. No browser-side wallet, checkout, item entitlement, XP
// boost or forge success adjustment can be produced from a button here.
const PAGE_HEROES = {
 featured:{title:'Moonveil Regalia',eyebrow:'MYTHIC · COSMETIC SET',tagline:'A new form for your legend.',art:'samurai'},
 costumes:{title:'Regalia Gallery',eyebrow:'COSTUMES & CUSTOMS',tagline:'Wear the story you choose.',art:'samurai'},
 companions:{title:'Soulbound Allies',eyebrow:'COMPANION COLLECTION',tagline:'Bring your spirit by your side.',art:'wolf'},
 mounts:{title:'Spirit Stables',eyebrow:'MOUNTS & STYLES',tagline:'Every journey leaves a legend.',art:'wolf'},
 progression:{title:'Wayfarer Archive',eyebrow:'JOURNEY & GROWTH',tagline:'A more rewarding adventure.',art:'samurai'},
 forge:{title:'The Starforge',eyebrow:'ENCHANT · COMBINE · ASCEND',tagline:'Refine your path with care.',art:'samurai'},
 passes:{title:'Season Chronicle',eyebrow:'SEASON PASSES',tagline:'A new chapter with every season.',art:'passBanner'},
 bundles:{title:'Starter Collections',eyebrow:'CURATED BUNDLES',tagline:'Discover a collection made for you.',art:'starterBanner'},
 currency:{title:'Crystal Treasury',eyebrow:'PREMIUM CURRENCY',tagline:'Secure purchases, when available.',art:'starterBanner'}
};

const FORMAT_CRYSTALS = new Intl.NumberFormat('en-US');
const formatPrice = offer => offer.previewPrice == null ? (offer.priceLabel || 'Price TBD') : FORMAT_CRYSTALS.format(offer.previewPrice);
const selectArt = offer => {
  if(offer.art && STORE_ART[offer.art]) return STORE_ART[offer.art];
  if(offer.id==='moonveil-regalia')return STORE_ART.samurai;
  if(offer.tab==='mounts'||offer.tab==='companions')return STORE_ART.wolf;
  if(offer.tab==='passes')return STORE_ART.passBanner;
  if(offer.tab==='bundles')return STORE_ART.starterBanner;
  return null;
};

function HeroCard({tab,onPreview}) {
  const hero=PAGE_HEROES[tab] || PAGE_HEROES.featured;
  return <section className={`soul-shelf-hero soul-shelf-hero--${tab}`} aria-label={hero.title}>
    <img className="soul-shelf-backdrop" src={STORE_ART.scenery} alt="" draggable={false}/>
    {hero.art==='samurai' && <img className="soul-shelf-figure" src={STORE_ART.samurai} alt="" draggable={false}/>}
    {hero.art==='wolf' && <img className="soul-shelf-figure" src={STORE_ART.wolf} alt="" draggable={false}/>}
    {hero.art==='samurai' && <img className="soul-shelf-wolf" src={STORE_ART.wolf} alt="" draggable={false}/>}
    {hero.art==='passBanner' && <img className="soul-shelf-object" src={STORE_ART.passBanner} alt="" draggable={false}/>}
    {hero.art==='starterBanner' && <img className="soul-shelf-object" src={STORE_ART.starterBanner} alt="" draggable={false}/>}
    <div className="soul-shelf-hero-shade"/>
    <div className="soul-shelf-hero-copy">
      <span>{hero.eyebrow}</span>
      <h2>{hero.title}</h2>
      <p>{hero.tagline}</p>
      <button type="button" onClick={onPreview}><Eye size={14}/> View feature</button>
    </div>
  </section>;
}
function CardArtwork({offer}) {
  const asset=selectArt(offer);
  return <div className={`soul-card-art soul-card-art--${offer.tone || 'moonlight'}`}>
    {asset ? <img src={asset} alt="" loading="lazy" draggable={false}/> :
      <div className="soul-item-illustration" aria-hidden="true">
        <span>{offer.icon||'✦'}</span>
        <ImageIcon size={16} className="soul-art-watermark"/>
      </div>}
    <span className="soul-card-rarity">{offer.rarity||'rare'}</span>
  </div>;
}
function ShelfCard({offer,onPreview,onBuy}) {
  return <article className="soul-shelf-card">
    <button className="soul-card-view" onClick={()=>onPreview(offer.id)} type="button" aria-label={`View ${offer.name}`}>
      <CardArtwork offer={offer}/>
      <strong title={offer.name}>{offer.name}</strong>
      <p>{offer.note || offer.desc}</p>
    </button>
    <div className="soul-card-actions">
      <button type="button" className="soul-card-preview" onClick={()=>onPreview(offer.id)}><Eye size={13}/> Preview</button>
      <span className="soul-card-price" title="Illustrative concept price; not a live store price">
        {offer.previewPrice == null ? null : <Gem size={13}/>}
        {formatPrice(offer)}
      </span>
      <button type="button" className="soul-card-buy" onClick={()=>onBuy(offer.id)}>Buy</button>
    </div>
  </article>;
}
function DetailModal({offer,purchaseIntent,onClose,onBag}) {
  if(!offer)return null;
  const art=selectArt(offer);
  return <div className="soul-shop-curtain" onMouseDown={onClose}>
    <section className="soul-shop-modal" role="dialog" aria-modal="true" aria-label={`${offer.name} details`} onMouseDown={e=>e.stopPropagation()}>
      <header><span>{purchaseIntent?'PURCHASE PREVIEW':'ITEM PREVIEW'} · {offer.tag}</span>
        <button type="button" onClick={onClose} aria-label="Close item details"><X size={18}/></button></header>
      <div className="soul-shop-detail-art">{art?<img alt="" src={art}/>:<span>{offer.icon||'✧'}</span>}</div>
      <h2>{offer.name}</h2>
      <p>{offer.note||offer.desc}</p>
      <div className="soul-shop-detail-info"><span>Rarity <strong>{offer.rarity||'rare'}</strong></span>
        <span>Illustrative price <strong>{formatPrice(offer)}{offer.previewPrice == null?'':' crystals'}</strong></span></div>
      <div className="soul-shop-effect"><strong>Contents / proposed behavior</strong><p>{offer.effect || 'Details pending final catalog approval. No gameplay effect is active.'}</p></div>
      <p className="soul-shop-warning"><LockKeyhole size={15}/> Checkout unavailable — no money is charged and no item is granted.</p>
      <div className="soul-shop-modal-actions">
        <button className="soul-card-buy" onClick={()=>onBag(offer.id)} type="button">Add to preview bag</button>
        <button className="soul-shop-disabled" disabled type="button">Checkout unavailable</button>
      </div>
    </section>
  </div>;
}
function BagModal({ids,onRemove,onClose}) {
  return <div className="soul-shop-curtain" onMouseDown={onClose}>
    <section className="soul-shop-modal soul-shop-bag" role="dialog" aria-modal="true" aria-label="Preview Bag" onMouseDown={e=>e.stopPropagation()}>
      <header><span>PREVIEW BAG</span><button type="button" aria-label="Close bag" onClick={onClose}><X size={18}/></button></header>
      <h2>Preview Bag</h2><p>These are sample catalog selections, not purchases.</p>
      {ids.length ? ids.map(id=>{
        const offer=getOffer(id);
        return offer && <div className="soul-shop-bag-row" key={id}>
          <span className="soul-bag-icon">{offer.icon||'✦'}</span>
          <div><strong>{offer.name}</strong><small>{formatPrice(offer)} · preview only</small></div>
          <button type="button" onClick={()=>onRemove(id)}>Remove</button>
        </div>;
      }):<p className="soul-bag-empty">Your bag is empty. Select any card to explore an offer.</p>}
      <button className="soul-shop-disabled soul-bag-checkout" type="button" disabled>Checkout unavailable</button>
      <p className="soul-shop-warning"><LockKeyhole size={15}/> Purchases need verified payment and account-bound entitlement delivery.</p>
    </section>
  </div>;
}
export default function SoulEmporiumOverlay({isOpen,onClose}) {
  const [tab,setTab]=useState('featured');
  const [rarity,setRarity]=useState('all');
  const [type,setType]=useState('all');
  const [query,setQuery]=useState('');
  const [sort,setSort]=useState('default');
  const [detail,setDetail]=useState(null);
  const [bag,setBag]=useState([]);
  const [bagOpen,setBagOpen]=useState(false);
  const closeRef=useRef(null);
  const scrollRef=useRef(null);
  useEffect(()=>{
    if(!isOpen)return;
    document.exitPointerLock?.();
    closeRef.current?.focus();
  },[isOpen]);
  const page=STORE_TABS.find(x=>x.id===tab)||STORE_TABS[0];
  const types=getAvailableTypes(tab);
  const offers=useMemo(()=>{
    const q=query.trim().toLowerCase();
    const filtered=getTabOffers(tab).filter(offer=>
      (rarity==='all'||offer.rarity===rarity) &&
      (type==='all'||offer.type===type) &&
      (!q||`${offer.name} ${offer.note||''} ${offer.type}`.toLowerCase().includes(q))
    );
    if(sort==='name') filtered.sort((a,b)=>a.name.localeCompare(b.name));
    if(sort==='price-low') filtered.sort((a,b)=>(a.previewPrice??Infinity)-(b.previewPrice??Infinity));
    if(sort==='price-high') filtered.sort((a,b)=>(b.previewPrice??-1)-(a.previewPrice??-1));
    return filtered;
  },[tab,rarity,type,query,sort]);
  const navigate=id=>{
    setTab(id);setRarity('all');setType('all');setSort('default');setQuery('');
    setDetail(null);setBagOpen(false);
    scrollRef.current?.scrollTo({top:0,behavior:'auto'});
  };
  const openItem=(id,purchaseIntent=false)=>{setBagOpen(false);setDetail({id,purchaseIntent});};
  const addBag=id=>setBag(prev=>prev.includes(id)?prev:[...prev,id]);
  const showHero=()=>openItem(getTabOffers(tab)[0]?.id || 'moonveil-regalia');
  return <AnimatePresence>
    {isOpen && <motion.div className="soul-emporium" data-theme={page.theme}
      role="dialog" aria-modal="true" aria-label="Soul Emporium premium store"
      initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.14}}>
      <div className="soul-store-shell">
        <header className="soul-store-top">
          <div className="soul-store-brand"><span aria-hidden="true">✥</span><div><h1>SOUL EMPORIUM</h1><small>GAME 3D · PREMIUM STORE</small></div></div>
          <div className="soul-store-account">
            <button type="button" className="soul-store-balance" onClick={()=>navigate('currency')}
              aria-label="Premium wallet details; balance unavailable"><Gem size={16}/> — <span>Crystals</span></button>
            <button type="button" className="soul-store-bag-button" onClick={()=>setBagOpen(true)}>
              <ShoppingCart size={16}/> Bag ({bag.length})</button>
            <button type="button" className="soul-store-close" onClick={onClose} ref={closeRef} aria-label="Close store"><X size={19}/></button>
          </div>
        </header>
        <nav className="soul-store-top-nav" aria-label="Premium store sections">
          {STORE_TABS.map(t=><button type="button" key={t.id} onClick={()=>navigate(t.id)}
            aria-current={tab===t.id?'page':undefined} className={tab===t.id?'is-active':''}>
            <span aria-hidden="true">{t.icon}</span>{t.label}</button>)}
        </nav>
        <div className="soul-store-layout">
          <aside className="soul-store-sidebar" aria-label="Store browsing and filters">
            <HeroCard tab={tab} onPreview={showHero}/>
            <nav className="soul-store-side-nav" aria-label="Store categories">
              {STORE_TABS.map(t=><button type="button" key={t.id}
                className={tab===t.id?'is-active':''} aria-current={tab===t.id?'page':undefined}
                onClick={()=>navigate(t.id)}>
                <span className="soul-side-icon">{t.icon}</span>
                <span>{t.label}<small>{t.subtitle}</small></span>
                <ChevronRight size={16}/></button>)}
            </nav>
            <section className="soul-store-filters">
              <div className="soul-store-filters-heading"><h3><SlidersHorizontal size={17}/> Filters</h3>
                <button type="button" onClick={()=>{setRarity('all');setType('all');setQuery('');setSort('default');}}><RotateCcw size={13}/> Reset</button></div>
              <label>Rarity
                <select aria-label="Filter by rarity" value={rarity} onChange={e=>setRarity(e.target.value)}>
                  {STORE_RARITIES.map(value=><option key={value} value={value}>{value==='all'?'All Rarities':value[0].toUpperCase()+value.slice(1)}</option>)}
                </select>
              </label>
              <label>Item type
                <select aria-label="Filter by item type" value={type} onChange={e=>setType(e.target.value)}>
                  <option value="all">All Types</option>{types.map(value=><option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            </section>
          </aside>
          <main className="soul-store-catalog" ref={scrollRef} aria-label={`${page.label} offers`}>
            <div className="soul-store-catalog-head">
              <div><span className="soul-store-kicker">{page.icon} · {page.label.toUpperCase()}</span>
                <h2>{tab==='featured'?'Featured Offers':page.title}</h2>
                <p>{tab==='featured'?'Explore today’s highlighted collections.':page.subtitle}</p></div>
              <div className="soul-store-summary">
                <span>{offers.length} preview items</span>
                <label className="soul-store-search"><Search size={14}/><input aria-label="Search catalog" placeholder="Search offers" value={query} onChange={e=>setQuery(e.target.value)}/></label>
                <select aria-label="Sort offers" value={sort} onChange={e=>setSort(e.target.value)}>
                  <option value="default">Featured order</option>
                  <option value="name">Name A–Z</option>
                  <option value="price-low">Price: Low–High</option>
                  <option value="price-high">Price: High–Low</option>
                </select>
              </div>
            </div>
            <p className="soul-store-demo-notice"><ShieldCheck size={14}/> Illustrative crystal prices only — actual purchases and balances are not yet connected.</p>
            {offers.length?
              <div className="soul-store-products">{offers.map(offer=>
                <ShelfCard key={offer.id} offer={offer} onPreview={id=>openItem(id)} onBuy={id=>openItem(id,true)}/>)}</div>:
              <div className="soul-store-no-results"><ImageIcon size={24}/><h3>No matching items</h3>
                <p>Change the search terms or filters to see more offers.</p>
                <button type="button" onClick={()=>{setRarity('all');setType('all');setQuery('');}}>Clear filters</button></div>}
            <div className="soul-store-end"><Check size={15}/> All preview products displayed. New items can be added without changing the layout.</div>
          </main>
        </div>
        <footer className="soul-store-footer"><span><ShieldCheck size={14}/> Store preview · No payment or gameplay effects active</span>
          <button type="button" onClick={()=>setBagOpen(true)}>View bag <ChevronRight size={15}/></button></footer>
      </div>
      {detail && <DetailModal offer={getOffer(detail.id)} purchaseIntent={detail.purchaseIntent} onClose={()=>setDetail(null)} onBag={id=>addBag(id)}/>}
      {bagOpen && <BagModal ids={bag} onClose={()=>setBagOpen(false)} onRemove={id=>setBag(prev=>prev.filter(x=>x!==id))}/>}
    </motion.div>}
  </AnimatePresence>;
}
