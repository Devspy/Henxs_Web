const searchInput=document.querySelector('#globalSearch');
const zoneFilter=document.querySelector('#zoneFilter');
const moduleFilter=document.querySelector('#moduleFilter');
const activityRows=[...document.querySelectorAll('.activity-table tbody tr')];

function filterDashboard(){
  const query=(searchInput?.value||'').trim().toLowerCase();
  const zone=zoneFilter?.value||'All Zones';
  const module=moduleFilter?.value||'All Modules';
  activityRows.forEach(row=>{
    const matchesQuery=!query||row.innerText.toLowerCase().includes(query);
    const matchesZone=zone==='All Zones'||row.dataset.zone===zone;
    const matchesModule=module==='All Modules'||row.dataset.module===module;
    row.hidden=!(matchesQuery&&matchesZone&&matchesModule);
  });
  document.querySelectorAll('.district').forEach(district=>{
    district.hidden=zone!=='All Zones'&&!district.innerText.includes(zone.replace(' Zone',''));
  });
}

document.querySelector('#applyFilters')?.addEventListener('click',filterDashboard);
document.querySelector('#resetFilters')?.addEventListener('click',()=>{
  zoneFilter.value='All Zones';
  moduleFilter.value='All Modules';
  searchInput.value='';
  filterDashboard();
});
searchInput?.addEventListener('input',filterDashboard);
document.querySelector('#menuToggle')?.addEventListener('click',()=>document.querySelector('#sidebar')?.classList.toggle('open'));
document.querySelectorAll('.range-tabs button').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('.range-tabs button').forEach(item=>item.classList.toggle('selected',item===button));
}));
document.querySelectorAll('.map-zoom button').forEach((button,index)=>button.addEventListener('click',()=>{
  const map=document.querySelector('.city-map');
  const current=Number(map.dataset.zoom||1);
  const next=index===0?Math.min(1.3,current+.1):index===1?Math.max(.9,current-.1):1;
  map.dataset.zoom=next;
  map.querySelectorAll('.district,.map-pin,.map-label').forEach(item=>item.style.scale=String(next));
}));
