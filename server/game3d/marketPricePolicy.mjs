// Foundation 13.7 — AGP amount parsing for non-transactional market preview.
// Prices are integer-only: floating point or negative prices are rejected.
const MAX_PRICE=100000000n;
export function inspectGame3DMarketPrice({askAGP,isAuction=false,
 durationHours=null}={}){
 const fail=code=>({ok:false,code,listingAuthorized:false,
  paymentAuthorized:false});
 const amount=typeof askAGP==='string'&&/^[1-9][0-9]*$/.test(askAGP)?
  BigInt(askAGP):typeof askAGP==='bigint'?askAGP:null;
 if(amount===null||amount<1n||amount>MAX_PRICE||
    typeof isAuction!=='boolean')
  return fail('invalid_market_price');
 if(isAuction){
  if(!Number.isSafeInteger(durationHours)||
     durationHours<1||durationHours>168)
   return fail('invalid_auction_duration');
 }else if(durationHours!==null)return fail('unexpected_auction_duration');
 return {ok:true,askAGP:amount.toString(),isAuction,
  durationHours:isAuction?durationHours:null,
  previewOnly:true,listingAuthorized:false,
  paymentAuthorized:false,escrowAuthorized:false};
}
