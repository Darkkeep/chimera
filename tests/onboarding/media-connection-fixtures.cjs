// Synthetic connection references only; no real credentials or provider traffic.
async function mockMediaConnections(page) {
  const connection = { id: 'pythia', name: 'Pythia', provider: 'pythia', executor: 'pythia', configured: true,
    supports: ['scene','image','narration'], readyFor: ['scene','image','narration'],
    models: {scene:'fixture-text',image:'fixture-image',narration:'fixture-audio'}, revisions: {}, voice:'alloy',language:'en-US',reason:'' };
  await page.route('**/api/ai-connections', route => route.fulfill({json:{connections:[connection],defaults:{scene:'pythia',image:'pythia',narration:'pythia',video:null},videoUnavailableReason:'No configured video generator.'}}));
}
function mediaCapability(value) {
  const configured=Boolean(value.providerConfigured);
  const narration=value.narrationConnections ?? (configured ? [{id:'legacy-openai',name:'Fixture narration connection',provider:'openai',voice:'alloy',model:'fixture-audio',language:'en-US'}] : []);
  const options=narration.map(item=>({...item,executor:'chimera',configured:true,supports:['narration'],readyFor:['narration'],models:{narration:item.model},revisions:{},reason:''}));
  if (configured && (value.imageConfigured ?? true)) {
    const existing=options.find(item=>item.id==='legacy-openai');
    if (existing) { existing.readyFor.push('image'); existing.supports.push('image'); existing.models.image='fixture-image'; }
    else options.push({id:'legacy-openai',name:'Fixture image connection',provider:'openai',executor:'chimera',configured:true,supports:['image'],readyFor:['image'],models:{image:'fixture-image'},revisions:{},voice:'alloy',language:'en-US',reason:''});
  }
  return {...value,narrationConnections:narration,connectionOptions:options,defaultConnections:{scene:null,image:options.some(item=>item.readyFor.includes('image'))?'legacy-openai':null,narration:null,video:null},videoConfigured:false};
}
module.exports={mockMediaConnections,mediaCapability};
