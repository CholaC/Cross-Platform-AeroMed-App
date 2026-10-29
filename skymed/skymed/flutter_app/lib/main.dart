import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'api.dart';
import 'push.dart';

void main() => runApp(const SkyMedApp());
class SkyMedApp extends StatelessWidget {
  const SkyMedApp({super.key});
  @override Widget build(BuildContext context) => MaterialApp(
    title: 'SkyMed Zambia', debugShowCheckedModeBanner: false,
    theme: ThemeData(useMaterial3: true, colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff087f83)),
      scaffoldBackgroundColor: const Color(0xfff2f6f9),
      inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder())),
    home: const Workspace(),
  );
}
class Workspace extends StatefulWidget {
  const Workspace({super.key});
  @override State<Workspace> createState() => _WorkspaceState();
}
class _WorkspaceState extends State<Workspace> {
  final api = Api(); final push = PushService();
  Map<String,dynamic> catalog = {}; List<dynamic> requests=[], visits=[], notices=[], routes=[];
  Map<String,dynamic>? experiment;
  String screen='Requests', username='', password='', facility='101', specialty='Cardiology', date='', origin='lusaka', destination='101';
  String requestKey=''; bool busy=false; String message=''; Timer? timer; final seen=<String>{};
  bool get planner => api.user?['role'] != 'health_worker';
  String newKey() => '${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1<<30)}';
  @override void initState() { super.initState(); requestKey=newKey(); timer=Timer.periodic(const Duration(seconds:15), (_) => poll()); }
  @override void dispose() { timer?.cancel(); push.dispose(); super.dispose(); }
  void show(String text) { if(mounted) setState(()=>message=text); }
  Future<void> action(Future<void> Function() f) async {
    if(busy)return;setState(()=>busy=true);
    try {await f();} catch(e) {show(e.toString());} finally {if(mounted)setState(()=>busy=false);}
  }
  Future<void> poll() async {
    if(api.user==null||busy)return;
    try {final data=await api.call('/notifications') as List; if(!mounted)return;
      for(final n in data.where((n)=>n['channel']=='in_app')) { if(seen.add(n['id'])) show(n['message']); }
      setState(()=>notices=data);
    }catch(_) { /* Keep last confirmed state when disconnected. */ }
  }
  Future<void> reload() async {
    final results=await Future.wait([api.call('/catalog'),api.call('/requests'),api.call('/visits'),api.call('/notifications')]);
    if(!mounted)return;setState(() {catalog=Map<String,dynamic>.from(results[0]);requests=results[1];visits=results[2];notices=results[3];});
  }
  Widget card(String title,List<Widget> children) => Card(child:Padding(padding:const EdgeInsets.all(20),child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[Text(title,style:Theme.of(context).textTheme.titleLarge),const SizedBox(height:16),...children])));
  Widget textField(String label,void Function(String) onChanged,{String? initial,bool secret=false}) => Padding(padding:const EdgeInsets.only(bottom:16),child:TextFormField(initialValue:initial,decoration:InputDecoration(labelText:label),obscureText:secret,onChanged:onChanged));
  Widget choice(String label,String value,List<Map<String,String>> options,void Function(String) changed) => Padding(padding:const EdgeInsets.only(bottom:16),child:DropdownButtonFormField<String>(initialValue:options.any((x)=>x['id']==value)?value:null,isExpanded:true,decoration:InputDecoration(labelText:label),items:options.map((o)=>DropdownMenuItem(value:o['id'],child:Text(o['name']!,overflow:TextOverflow.ellipsis))).toList(),onChanged:(v){if(v!=null)changed(v);}));
  List<Map<String,String>> opts(String name) => (catalog[name] as List? ?? []).map((x)=><String,String>{'id':x['id'].toString(),'name':x['name'].toString()}).toList();
  List<Map<String,String>> get specs => (catalog['specialties'] as List? ?? []).map((x)=><String,String>{'id':x.toString(),'name':x.toString()}).toList();
  Widget button(String text,Future<void> Function() f) => Padding(padding:const EdgeInsets.only(bottom:12),child:FilledButton(onPressed:busy?null:()=>action(f),child:Padding(padding:const EdgeInsets.all(12),child:Text(text))));
  @override Widget build(BuildContext context) {
    if(api.user==null) return Scaffold(appBar:AppBar(title:const Text('SkyMed Zambia')),body:Center(child:ConstrainedBox(constraints:const BoxConstraints(maxWidth:480),child:ListView(shrinkWrap:true,padding:const EdgeInsets.all(24),children:[card('Sign in to outreach coordination',[
      textField('Username',(v)=>username=v),textField('Password',(v)=>password=v,secret:true),
      button('Sign in',() async {await api.login(username,password);facility=api.user!['facility']??'101';await reload();}),
      const Text('Local demo: worker / dispatcher / flightops\nPassword: DemoPass123!'),Text(message),
    ])]))));
    final pages=['Requests','Transport',if(planner)'Schedule',if(planner)'Simulation','Notifications'];
    final icons=[Icons.medical_services_outlined,Icons.route,if(planner)Icons.calendar_month,if(planner)Icons.analytics_outlined,Icons.notifications_outlined];
    return Scaffold(appBar:AppBar(title:Text('SkyMed · $screen'),actions:[IconButton(tooltip:'Refresh',onPressed:()=>action(reload),icon:const Icon(Icons.refresh)),IconButton(tooltip:'Sign out',onPressed:()=>action(() async {await api.call('/logout',body:{});push.dispose();setState((){api.user=null;api.token='';seen.clear();message='';screen='Requests';});}),icon:const Icon(Icons.logout))]),
      body:Row(children:[if(MediaQuery.sizeOf(context).width>800) NavigationRail(selectedIndex:pages.indexOf(screen),labelType:NavigationRailLabelType.all,onDestinationSelected:(i)=>setState(()=>screen=pages[i]),destinations:List.generate(pages.length,(i)=>NavigationRailDestination(icon:Icon(icons[i]),label:Text(pages[i])))),
      Expanded(child:ListView(padding:const EdgeInsets.all(20),children:[
        const Text('PROTOTYPE · Synthetic routes/resources · Dates require approval',style:TextStyle(color:Color(0xff806019))),
        if(busy)const LinearProgressIndicator(),if(message.isNotEmpty)Padding(padding:const EdgeInsets.symmetric(vertical:12),child:Text(message,semanticsLabel:'Status: $message')),
        if(screen=='Requests')...requestView(),if(screen=='Transport')...routeView(),if(screen=='Schedule')...scheduleView(),if(screen=='Simulation')...simulationView(),if(screen=='Notifications')...notificationView(),
      ]))]),
      bottomNavigationBar:MediaQuery.sizeOf(context).width<=800?NavigationBar(selectedIndex:pages.indexOf(screen),onDestinationSelected:(i)=>setState(()=>screen=pages[i]),destinations:List.generate(pages.length,(i)=>NavigationDestination(icon:Icon(icons[i]),label:pages[i]))):null,
    );
  }
  List<Widget> requestView() => [card('Request a specialist',[
    choice('Facility',facility,opts('facilities').where((f)=>planner||f['id']==api.user!['facility']).toList(),(v)=>facility=v),
    choice('Specialist',specialty,specs,(v)=>specialty=v),
    textField('Requested date (YYYY-MM-DD)',(v)=>date=v,initial:date),
    const Text('Queue is assigned per facility and specialty. A requested date is not confirmed.'),const SizedBox(height:12),
    button('Submit request',() async {final r=await api.call('/requests',body:{'facility':facility,'specialty':specialty,'preferred_date':date,'request_key':requestKey});requestKey=newKey();show('Submitted. Queue ${r['queue_position']}. Approved date pending.');await reload();}),
  ]),...requests.map((r)=>card('${r['specialty']} · ${r['status']}',[Text('Reference: ${r['id']}'),Text('Queue: ${r['status']=='submitted'?r['queue_position']:'Scheduled'}'),Text('Requested: ${r['preferred_date']}'),Text('Approved: ${r['approved_date']??'Pending approval'}')]))];
  List<Widget> routeView() => [card('Compare air and road legs',[
    choice('Origin',origin,opts('facilities'),(v)=>origin=v),choice('Destination',destination,opts('facilities'),(v)=>destination=v),
    button('Calculate estimates',() async {final r=await api.call('/routes?origin=${Uri.encodeComponent(origin)}&destination=${Uri.encodeComponent(destination)}');setState(()=>routes=r);}),
  ]),...routes.map((r)=>card('${r['name']} · ${r['mode']}',[Text('${r['distance_km']??'—'} km · ${r['minutes']??'—'} minutes',style:Theme.of(context).textTheme.headlineSmall),Text(r['reason']),Text(r['source'])]))];
  List<Widget> scheduleView() => [button('Plan outreach visit',() async {await editVisit();}),...visits.map((v)=>card('${v['specialty']} · ${v['facility']}',[Text('${v['start']} → ${v['end']} (UTC)'),Text('${v['status']} · revision ${v['revision']}'),Text('Resource ${v['resource']} · team ${v['team']}'),if(v['status']!='cancelled')button('Review / revise',() async {await editVisit(Map<String,dynamic>.from(v));})])),card('Resource availability',opts('resources').map((r){final resource=(catalog['resources'] as List).firstWhere((x)=>x['id']==r['id']);return SwitchListTile(title:Text(r['name']!),value:resource['available']==1,onChanged:(v)=>action(() async {await api.call('/resources/${r['id']}',body:{'available':v});await reload();}));}).toList())];
  Future<void> editVisit([Map<String,dynamic>? old]) async {
    final b=<String,dynamic>{'facility':'101','origin':'lusaka','specialty':'Cardiology','resource':'air-1','team':'team-1','status':'draft','start':'','end':'','reason':'',...?old};
    if(['approved','changed'].contains(b['status']))b['status']='changed';
    String localMessage='';bool saving=false;
    await showDialog<void>(context:context,barrierDismissible:false,builder:(ctx)=>StatefulBuilder(builder:(ctx,setDialog)=>AlertDialog(title:Text(old==null?'Plan visit':'Revise visit'),content:SizedBox(width:540,child:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,children:[
      const Text('Times are UTC. Approval includes pending requests for this facility/specialty with requested dates on or before the visit. Reserve round-trip travel and at least 60 minutes onsite.'),const SizedBox(height:16),
      choice('Facility',b['facility'],opts('facilities'),(v)=>b['facility']=v),choice('Origin',b['origin'],opts('facilities'),(v)=>b['origin']=v),choice('Specialist',b['specialty'],specs,(v)=>b['specialty']=v),
      textField('Start UTC (2026-12-01T08:00:00Z)',(v)=>b['start']=v,initial:b['start']),textField('End UTC (2026-12-01T16:00:00Z)',(v)=>b['end']=v,initial:b['end']),
      choice('Resource',b['resource'],opts('resources'),(v)=>b['resource']=v),choice('Team',b['team'],opts('teams'),(v)=>b['team']=v),
      choice('Decision',b['status'],(old!=null&&['approved','changed'].contains(old['status'])?['changed','cancelled']:['draft','approved',if(old!=null)'cancelled']).map((x)=><String,String>{'id':x,'name':x}).toList(),(v)=>b['status']=v),
      textField('Reason for revision / cancellation',(v)=>b['reason']=v),Text(localMessage),if(saving)const LinearProgressIndicator(),
    ]))),actions:[TextButton(onPressed:saving?null:()=>Navigator.pop(ctx),child:const Text('Close')),TextButton(onPressed:saving?null:() async {setDialog(()=>saving=true);try{final r=await api.call('/conflicts',body:b);setDialog(()=>localMessage=(r['conflicts'] as List).isEmpty?'No conflicts':r['conflicts'].join('; '));}catch(e){setDialog(()=>localMessage=e.toString());}finally{setDialog(()=>saving=false);}},child:const Text('Check conflicts')),
      FilledButton(onPressed:saving?null:() async {
        final confirmed=await showDialog<bool>(context:ctx,builder:(c)=>AlertDialog(title:Text('Save as ${b['status']}?'),content:const Text('Approved changes and cancellations notify facility staff.'),actions:[TextButton(onPressed:()=>Navigator.pop(c,false),child:const Text('Back')),FilledButton(onPressed:()=>Navigator.pop(c,true),child:const Text('Confirm'))]));
        if(confirmed!=true)return;setDialog(()=>saving=true);
        try {if(old!=null)b['expected_revision']=old['revision'];await api.call('/visits${old!=null?'/${old['id']}':''}',body:b,method:old==null?'POST':'PUT');if(ctx.mounted)Navigator.pop(ctx);}catch(e){setDialog((){saving=false;localMessage=e.toString();});}
      },child:const Text('Review and save')),
    ])));
    await reload();
  }
  List<Widget> simulationView() => [card('Synthetic schedule efficiency experiment',[
    const Text('600 simulated visits · seed 42 · 80/20 split · 5-fold validation. Results reflect assumptions, not real ZFDS evidence.'),
    button('Run model comparison',() async {final r=await api.call('/simulation',body:{'samples':600,'seed':42});setState(()=>experiment=Map<String,dynamic>.from(r));}),
    if(experiment!=null)...[
      Text('Selected model: ${experiment!['best_model']}'),Text(experiment!['target']),
      ...((experiment!['models'] as Map).entries.map((e)=>ListTile(title:Text(e.key),subtitle:Text('Validation MAE: ${(e.value['validation_mae'] as num).toStringAsFixed(2)}')))),
      Text('Held-out test MAE: ${(experiment!['test']['mae'] as num).toStringAsFixed(2)}'),
      const Text('Predictive factors (held-out permutation importance)'),
      ...(experiment!['factors'] as List).map((f)=>ListTile(title:Text(f['factor']),subtitle:Text('MAE increase ${(f['importance'] as num).toStringAsFixed(2)} ± ${(f['std'] as num).toStringAsFixed(2)}'))),
      Text(experiment!['assumptions']),Text(experiment!['limitation']),
    ],
  ])];
  List<Widget> notificationView() => [card('Outreach notifications',[
    const Text('In-app notices refresh every 15 seconds. SMS / push require live provider setup. Simulated is not delivered.'),
    button('Enable push notifications',() async {await push.enable(api,show);show('Push notifications registered');}),
  ]),...notices.map((n)=>card('${n['channel']} · ${n['status']}',[Text(n['message']),Text(n['created'])]))];
}
