import { ARMOR_CHOICES, normalizeArmorQuality } from './armorQuality.mjs';

export default function ArmorQualitySettings({ prefs, onChange }) {
  return <section className="dxr-settings-rows" aria-label="Armor rendering optimization" style={{color:'inherit'}}>
    <h3>Armor rendering optimization</h3>
    {[['armorQuality','Your armor'],['otherArmorQuality','Other fighters']].map(([key,label]) =>
      <label key={key}><span>{label}</span><select value={normalizeArmorQuality(prefs?.[key])}
        onChange={e=>onChange({[key]:e.target.value})}>
        {ARMOR_CHOICES.map(([value,name])=><option key={value} value={value}>{name}</option>)}
      </select></label>)}
    <p>Maximum performance skips separate armor meshes; low detail builds simpler attached armor. Both reduce character material and shadow cost. Fused outfits stay visible unless an optimized replacement exists. Equipment stats, hitboxes, abilities and weapons are unchanged. Applies to the next match or model preview.</p>
  </section>;
}
