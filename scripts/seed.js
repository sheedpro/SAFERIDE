'use strict';
require('dotenv').config(); const supabase=require('../src/db/supabase');
const routes=[
 {route_id:'RT-KLA-JINJA-001',name:'Kampala – Jinja Rd (Mukono)',aliases:['Kampala-Jinja','Jinja road','Mukono route'],polyline:'LINESTRING(32.58 0.31,32.63 0.335,32.69 0.341,32.755 0.353)'},
 {route_id:'RT-KLA-KIREKA-001',name:'Kampala – Kireka – Bweyogerere',aliases:['Kireka route','Bweyogerere'],polyline:'LINESTRING(32.58 0.31,32.62 0.336,32.645 0.355)'},
 {route_id:'RT-NTINDA-KIREKA-001',name:'Ntinda – Kireka',aliases:['Ntinda route'],polyline:'LINESTRING(32.615 0.348,32.645 0.355)'} ];
const checkpoints=[
 {checkpoint_id:'CKP-SEETA-001',name:'Seeta Checkpoint',location:'POINT(32.689 0.341)',route_ids:['RT-KLA-JINJA-001'],directions_covered:['eastbound','westbound'],duty_officers:[{badgeId:'UPF-88213',name:'Insp. K. Byaruhanga',whatsapp:'+256772000111',onDuty:true}],shift_start:'06:00',shift_end:'22:00'},
 {checkpoint_id:'CKP-KIREKA-001',name:'Kireka Checkpoint',location:'POINT(32.645 0.355)',route_ids:['RT-KLA-KIREKA-001','RT-NTINDA-KIREKA-001'],directions_covered:['eastbound','westbound'],duty_officers:[{badgeId:'UPF-77104',name:'Sgt. R. Amuge',whatsapp:'+256772000222',onDuty:true}],shift_start:'06:00',shift_end:'20:00'} ];
const stations=[{station_id:'STN-MUKONO-CENTRAL',name:'Mukono Central Police Station',phone_number:'0312-500-100',whatsapp:'+256772000222',location:'POINT(32.755 0.353)'}];
async function upsert(table, rows, key){const {error}=await supabase.from(table).upsert(rows,{onConflict:key});if(error)throw error;}
Promise.all([upsert('routes',routes,'route_id'),upsert('checkpoints',checkpoints,'checkpoint_id'),upsert('stations',stations,'station_id')]).then(()=>console.log('SafeRide seed data loaded.')).catch(e=>{console.error(e);process.exitCode=1;});
