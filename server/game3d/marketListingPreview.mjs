// Combat 8.6 — pure market listing preview classifier; no sale action.
export function reviewPrivateMarketPreview({row,ownerId,characterId,itemInstanceId}={}){
 const deny=code=>({ok:false,code,paymentAuthorized:false,
  itemTransferAuthorized:false,marketLive:false});
 if(!row||row.owner_id!==ownerId||
    row.character_id!==characterId||
    String(row.item_instance_id)!==itemInstanceId||
    row.record_kind!=='private_preview'||
    row.payment_enabled!==false||row.transfer_enabled!==false)
  return deny('invalid_market_preview_binding');
 return {ok:true,ownerId,characterId,itemInstanceId,
  listingId:String(row.listing_id),recordKind:'private_preview',
  paymentAuthorized:false,itemTransferAuthorized:false,
  marketLive:false};
}
