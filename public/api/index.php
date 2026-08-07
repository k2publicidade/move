<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const ADMIN_SALT = '31f038e6b6bca3783c0aa70410714e5b';
const ADMIN_HASH = 'cda5fa48e0df2e61627aed116d53abb0a443ad84bc685543f43073291c6573cf';
const ASSOCIATE_PLAN_CENTS = 5500;
const BONUS_CAP_CENTS = 50000;

$dataFile = '/home3/roniel22/gomove-data/db.json';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = preg_replace('#^/api#', '', $path) ?: '/';
$body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];

function uid(): string { return bin2hex(random_bytes(16)); }
function nowIso(): string { return gmdate('c'); }
function passHash(string $password, string $salt): string { return hash_pbkdf2('sha256', $password, $salt, 120000, 64); }
function safeUser(array $user): array { unset($user['passwordHash'], $user['passwordSalt']); return $user; }
function respond(int $status, mixed $value): never { http_response_code($status); echo json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function initialDb(): array {
  $adminId = uid();
  return [
    'users' => [[
      'id'=>$adminId,'username'=>'admin','email'=>'admin@gomoveinfra.com.br','name'=>'Administrador GoMove',
      'passwordSalt'=>ADMIN_SALT,'passwordHash'=>ADMIN_HASH,'role'=>'ADMIN_MASTER','status'=>'ACTIVE',
      'sponsorId'=>null,'inviteCode'=>'gomove'
    ]],
    'sessions'=>[], 'vehicles'=>[], 'investments'=>[], 'orders'=>[], 'invoices'=>[], 'transactions'=>[],
    'withdrawals'=>[], 'tickets'=>[], 'cart'=>[], 'profiles'=>[$adminId=>['name'=>'Administrador GoMove','email'=>'admin@gomoveinfra.com.br','country'=>'Brasil']],
    'commissionRules'=>[['id'=>uid(),'name'=>'Indicação direta + Unilevel GoMove','eventType'=>'INVESTMENT_CONFIRMED','active'=>true,'directReferralBps'=>500,'levels'=>[['level'=>1,'bps'=>600],['level'=>2,'bps'=>500],['level'=>3,'bps'=>400],['level'=>4,'bps'=>300],['level'=>5,'bps'=>200],['level'=>6,'bps'=>100]],'createdAt'=>nowIso()]],
    'commissionEvents'=>[], 'bonusEntries'=>[], 'auditLogs'=>[['id'=>uid(),'actorId'=>$adminId,'action'=>'PRODUCTION_INITIALIZED','targetType'=>'SYSTEM','targetId'=>'gomove','details'=>['mode'=>'production-php'],'createdAt'=>nowIso()]]
  ];
}
function openDb(string $file): array {
  if (!is_dir(dirname($file))) mkdir(dirname($file), 0700, true);
  $handle = fopen($file, 'c+');
  if (!$handle || !flock($handle, LOCK_EX)) respond(503, ['error'=>'Banco de dados temporariamente indisponível']);
  rewind($handle); $raw = stream_get_contents($handle); $db = $raw ? json_decode($raw, true) : initialDb();
  if (!is_array($db)) $db = initialDb();
  foreach (['users','sessions','vehicles','investments','orders','invoices','transactions','withdrawals','tickets','cart','commissionRules','commissionEvents','bonusEntries','auditLogs'] as $key) if (!isset($db[$key]) || !is_array($db[$key])) $db[$key]=[];
  if (!isset($db['profiles']) || !is_array($db['profiles'])) $db['profiles']=[];
  return [$handle, $db];
}
function saveDb($handle, array $db): void { rewind($handle); ftruncate($handle, 0); fwrite($handle, json_encode($db, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)); fflush($handle); flock($handle, LOCK_UN); fclose($handle); }
function closeDb($handle): void { flock($handle, LOCK_UN); fclose($handle); }
function findIndex(array $rows, callable $fn): int { foreach ($rows as $i=>$row) if ($fn($row)) return $i; return -1; }
function token(): string { return preg_replace('/^Bearer\s+/i', '', $_SERVER['HTTP_AUTHORIZATION'] ?? ''); }
function currentUser(array &$db): ?array {
  $token=token(); if (!$token) return null;
  $si=findIndex($db['sessions'], fn($s)=>hash_equals((string)$s['token'], $token) && ($s['expiresAt']??0)>time());
  if ($si<0) return null; $id=$db['sessions'][$si]['userId'];
  $ui=findIndex($db['users'], fn($u)=>$u['id']===$id && $u['status']==='ACTIVE'); return $ui>=0?$db['users'][$ui]:null;
}
function requireUser(array &$db): array { $u=currentUser($db); if (!$u) respond(401,['error'=>'Sessão inválida ou conta inativa']); return $u; }
function requireAdmin(array &$db): array { $u=requireUser($db); if (($u['role']??'')!=='ADMIN_MASTER') respond(403,['error'=>'Acesso administrativo obrigatório']); return $u; }
function audit(array &$db,string $actor,string $action,string $type,string $id,array $details=[]): void { array_unshift($db['auditLogs'],['id'=>uid(),'actorId'=>$actor,'action'=>$action,'targetType'=>$type,'targetId'=>$id,'details'=>$details,'createdAt'=>nowIso()]); }
function pageRows(array $rows): array { $page=max(1,(int)($_GET['page']??1));$size=min(100,max(1,(int)($_GET['pageSize']??20)));return ['items'=>array_values(array_slice($rows,($page-1)*$size,$size)),'page'=>$page,'pageSize'=>$size,'total'=>count($rows)]; }
function owned(array $rows,string $id): array { return array_values(array_filter($rows,fn($x)=>empty($x['userId'])||$x['userId']===$id)); }

[$handle,$db]=openDb($dataFile);

if ($method==='GET' && $path==='/health') { closeDb($handle); respond(200,['ok'=>true,'service'=>'GoMove API PHP','mode'=>'production']); }
if ($method==='POST' && in_array($path,['/auth/login','/login'],true)) {
  $login=strtolower(trim((string)($body['username']??''))); $ui=findIndex($db['users'],fn($u)=>strtolower($u['username'])===$login||strtolower($u['email'])===$login);
  if ($ui<0 || $db['users'][$ui]['status']!=='ACTIVE' || !hash_equals($db['users'][$ui]['passwordHash'],passHash((string)($body['password']??''),$db['users'][$ui]['passwordSalt']))) { closeDb($handle); respond(401,['error'=>'Usuário ou senha inválidos']); }
  $session=['token'=>bin2hex(random_bytes(32)),'userId'=>$db['users'][$ui]['id'],'expiresAt'=>time()+86400]; $db['sessions']=array_values(array_filter($db['sessions'],fn($s)=>($s['expiresAt']??0)>time())); $db['sessions'][]=$session; saveDb($handle,$db); respond(200,['token'=>$session['token'],'user'=>safeUser($db['users'][$ui])]);
}
if ($method==='GET' && $path==='/auth/me') { $u=requireUser($db); closeDb($handle); respond(200,['user'=>safeUser($u)]); }
if ($method==='GET' && preg_match('#^/public/invites/([^/]+)$#',$path,$m)) { $i=findIndex($db['users'],fn($u)=>strcasecmp($u['inviteCode'],$m[1])===0&&$u['status']==='ACTIVE'); if($i<0){closeDb($handle);respond(404,['error'=>'Convite indisponível']);} $u=$db['users'][$i];closeDb($handle);respond(200,['sponsor'=>['name'=>$u['name'],'inviteCode'=>$u['inviteCode']]]); }
if ($method==='POST' && $path==='/public/register') {
  foreach(['name','username','email','password','inviteCode'] as $field) if(!trim((string)($body[$field]??''))){closeDb($handle);respond(422,['error'=>'Campos obrigatórios ausentes']);}
  $username=strtolower(trim($body['username']));$email=strtolower(trim($body['email']));$si=findIndex($db['users'],fn($u)=>strcasecmp($u['inviteCode'],$body['inviteCode'])===0&&$u['status']==='ACTIVE');
  if($si<0){closeDb($handle);respond(422,['error'=>'Convite indisponível']);} if(strlen($body['password'])<6){closeDb($handle);respond(422,['error'=>'A senha deve ter ao menos 6 caracteres']);}
  if(findIndex($db['users'],fn($u)=>strtolower($u['username'])===$username||strtolower($u['email'])===$email)>=0){closeDb($handle);respond(409,['error'=>'Usuário ou e-mail já cadastrado']);}
  $salt=bin2hex(random_bytes(16));$u=['id'=>uid(),'name'=>trim($body['name']),'username'=>$username,'email'=>$email,'passwordSalt'=>$salt,'passwordHash'=>passHash($body['password'],$salt),'role'=>'ASSOCIATE','status'=>'PENDING','sponsorId'=>$db['users'][$si]['id'],'inviteCode'=>preg_replace('/[^a-z0-9]/','',$username).substr(bin2hex(random_bytes(3)),0,4),'membershipType'=>'ASSOCIATE','associatePlanStatus'=>'PENDING','associatePlanAmountCents'=>ASSOCIATE_PLAN_CENTS,'bonusCapCents'=>BONUS_CAP_CENTS];$db['users'][]=$u;$db['profiles'][$u['id']]=['name'=>$u['name'],'email'=>$u['email'],'country'=>'Brasil'];audit($db,$u['id'],'REGISTER','USER',$u['id'],['sponsorId'=>$u['sponsorId']]);saveDb($handle,$db);respond(201,['user'=>safeUser($u)]);
}

$user=requireUser($db);
if ($method==='GET' && $path==='/state') { $id=$user['id'];$result=[];foreach(['vehicles','investments','orders','invoices','transactions','withdrawals','tickets','cart'] as $key)$result[$key]=owned($db[$key],$id);$result['profile']=$db['profiles'][$id]??['name'=>$user['name'],'email'=>$user['email']];$result['business']=safeUser($user)+['approvedBonusCents'=>0,'pendingBonusCents'=>0,'blockedBonusCents'=>0,'bonusCapRemainingCents'=>BONUS_CAP_CENTS,'quotaAmountCents'=>0,'canReceiveFinancialResults'=>($user['membershipType']??'')==='SHAREHOLDER'];closeDb($handle);respond(200,$result); }
if ($method==='PUT' && $path==='/profile') { $allowed=['name','email','phone','birthdate','language','country','twoFactorLogin','twoFactorWithdraw','pixType'];$profile=$db['profiles'][$user['id']]??[];foreach($allowed as $key)if(array_key_exists($key,$body))$profile[$key]=$body[$key];$db['profiles'][$user['id']]=$profile;$ui=findIndex($db['users'],fn($u)=>$u['id']===$user['id']);if(isset($body['name']))$db['users'][$ui]['name']=$body['name'];if(isset($body['email']))$db['users'][$ui]['email']=$body['email'];saveDb($handle,$db);respond(200,$profile); }
if ($method==='GET' && $path==='/network/summary') { $direct=array_values(array_filter($db['users'],fn($u)=>($u['sponsorId']??null)===$user['id']));closeDb($handle);respond(200,['directs'=>count($direct),'networkSize'=>count($direct),'activeNetwork'=>count(array_filter($direct,fn($u)=>$u['status']==='ACTIVE')),'pendingDirects'=>count(array_filter($direct,fn($u)=>$u['status']==='PENDING'))]+safeUser($user)); }
if ($method==='GET' && $path==='/network/directs') { $rows=array_map('safeUser',array_values(array_filter($db['users'],fn($u)=>($u['sponsorId']??null)===$user['id'])));closeDb($handle);respond(200,pageRows($rows)); }
if ($method==='GET' && in_array($path,['/network/unilevel','/network/search'],true)) { $rows=array_map('safeUser',array_values(array_filter($db['users'],fn($u)=>($u['sponsorId']??null)===$user['id'])));closeDb($handle);respond(200,$path==='/network/search'?pageRows($rows):array_map(fn($u)=>$u+['level'=>1],$rows)); }
if ($method==='GET' && $path==='/network/tree') { $root=safeUser($user)+['children'=>array_map(fn($u)=>safeUser($u)+['children'=>[]],array_values(array_filter($db['users'],fn($u)=>($u['sponsorId']??null)===$user['id'])))];closeDb($handle);respond(200,$root); }
if ($method==='GET' && $path==='/bonuses/me') { $rows=array_values(array_filter($db['bonusEntries'],fn($x)=>($x['userId']??'')===$user['id']));closeDb($handle);respond(200,pageRows($rows)); }
foreach(['cart','investments','orders','tickets','invoices','withdrawals'] as $key) {
  if($method==='GET'&&$path==='/'.$key){$rows=owned($db[$key],$user['id']);closeDb($handle);respond(200,$rows);}
  if($method==='POST'&&$path==='/'.$key){if($key==='investments'){closeDb($handle);respond(503,['error'=>'Pagamento CoinPayments ainda não foi configurado']);}$item=$body+['id'=>uid(),'userId'=>$user['id'],'date'=>date('d/m/Y'),'createdAt'=>nowIso()];array_unshift($db[$key],$item);saveDb($handle,$db);respond(201,$item);}
}

$admin=requireAdmin($db);
if ($method==='GET' && $path==='/admin/dashboard') { $ass=array_values(array_filter($db['users'],fn($u)=>$u['role']==='ASSOCIATE'));closeDb($handle);respond(200,['users'=>count($db['users']),'active'=>count(array_filter($db['users'],fn($u)=>$u['status']==='ACTIVE')),'pending'=>count(array_filter($db['users'],fn($u)=>$u['status']==='PENDING')),'associates'=>count($ass),'shareholders'=>count(array_filter($ass,fn($u)=>($u['membershipType']??'')==='SHAREHOLDER')),'pendingPlans'=>count(array_filter($ass,fn($u)=>($u['associatePlanStatus']??'')!=='ACTIVE')),'vehicles'=>count($db['vehicles']),'activeVehicles'=>0,'revenue'=>0,'pendingWithdrawals'=>0,'openTickets'=>0,'bonusPendingCents'=>0,'bonusBlockedCents'=>0]); }
if ($method==='GET' && $path==='/admin/associates') { $rows=[];foreach($db['users'] as $u)if($u['role']==='ASSOCIATE')$rows[]=safeUser($u)+['phone'=>$db['profiles'][$u['id']]['phone']??''];closeDb($handle);respond(200,pageRows($rows)); }
if ($method==='POST' && $path==='/admin/associates') { $body['inviteCode']=$db['users'][findIndex($db['users'],fn($u)=>$u['role']==='ADMIN_MASTER')]['inviteCode'];$body['status']=$body['status']??'PENDING';closeDb($handle);respond(422,['error'=>'Use um link de convite para criar a conta e depois ative-a no painel']); }
if (preg_match('#^/admin/associates/([^/]+)(?:/(status))?$#',$path,$m)) {
  $ui=findIndex($db['users'],fn($u)=>$u['id']===$m[1]&&$u['role']==='ASSOCIATE');if($ui<0){closeDb($handle);respond(404,['error'=>'Associado não encontrado']);}
  if($method==='PATCH'){foreach(['name','username','email','status','associatePlanStatus','sponsorId','membershipType'] as $key)if(array_key_exists($key,$body))$db['users'][$ui][$key]=$body[$key];if(!empty($body['password'])){$salt=bin2hex(random_bytes(16));$db['users'][$ui]['passwordSalt']=$salt;$db['users'][$ui]['passwordHash']=passHash($body['password'],$salt);}if(($db['users'][$ui]['status']??'')==='ACTIVE'&&($db['users'][$ui]['associatePlanStatus']??'')!=='ACTIVE'){closeDb($handle);respond(422,['error'=>'Ative primeiro o Plano de Associado de R$ 55,00']);}audit($db,$admin['id'],'RECORD_UPDATE','USER',$m[1],$body);$safe=safeUser($db['users'][$ui]);saveDb($handle,$db);respond(200,$safe);}
  if($method==='GET'){closeDb($handle);respond(200,safeUser($db['users'][$ui]));}
}
if ($method==='GET' && $path==='/admin/network/tree') { $root=$db['users'][findIndex($db['users'],fn($u)=>$u['role']==='ADMIN_MASTER')];$tree=safeUser($root)+['children'=>array_map(fn($u)=>safeUser($u)+['children'=>[]],array_values(array_filter($db['users'],fn($u)=>($u['sponsorId']??null)===$root['id'])))];closeDb($handle);respond(200,$tree); }
foreach(['vehicles','investments','orders','invoices','withdrawals','tickets','commission-rules','bonus-entries','audit-logs'] as $slug) {
  $key=['commission-rules'=>'commissionRules','bonus-entries'=>'bonusEntries','audit-logs'=>'auditLogs'][$slug]??$slug;
  if($method==='GET'&&$path==='/admin/'.$slug){closeDb($handle);respond(200,pageRows($db[$key]));}
  if($method==='POST'&&$path==='/admin/'.$slug){$item=$body+['id'=>uid(),'createdAt'=>nowIso()];array_unshift($db[$key],$item);audit($db,$admin['id'],'RECORD_CREATE',strtoupper($slug),$item['id'],$body);saveDb($handle,$db);respond(201,$item);}
  if(preg_match('#^/admin/'.preg_quote($slug,'#').'/([^/]+)$#',$path,$m)){ $ii=findIndex($db[$key],fn($x)=>$x['id']===$m[1]);if($ii<0){closeDb($handle);respond(404,['error'=>'Registro não encontrado']);}if($method==='PATCH'){$db[$key][$ii]=array_replace($db[$key][$ii],$body);$item=$db[$key][$ii];saveDb($handle,$db);respond(200,$item);}if($method==='DELETE'){array_splice($db[$key],$ii,1);saveDb($handle,$db);respond(200,['id'=>$m[1]]);} }
}
closeDb($handle); respond(404,['error'=>'Rota não encontrada']);
