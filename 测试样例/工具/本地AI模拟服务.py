"""Run manually; binds loopback only; no external requests or prompt logging."""
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import json,time
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_GET(self):
  self.reply(200,{'object':'list','data':[{'id':m,'object':'model'} for m in ['fixture-ok','fixture-401','fixture-429','fixture-500','fixture-timeout','fixture-malformed']]})
 def reply(self,status,body):
  data=json.dumps(body,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers()
  try:self.wfile.write(data)
  except (BrokenPipeError,ConnectionResetError):pass
 def do_POST(self):
  try:
   n=int(self.headers.get('Content-Length','0'))
   if n>1024*1024:return self.reply(413,{'error':{'message':'Fixture limit 1MB'}})
   body=json.loads(self.rfile.read(n));model=body.get('model','fixture-ok')
  except Exception:return self.reply(400,{'error':{'message':'Invalid JSON'}})
  if model in ['fixture-401','fixture-429','fixture-500']:return self.reply(int(model[-3:]),{'error':{'message':'Synthetic API error'}})
  if model=='fixture-timeout':time.sleep(35)
  if model=='fixture-malformed':return self.reply(200,{'unexpected':'missing choices'})
  if body.get('stream'):return self.reply(400,{'error':{'message':'Fixture supports non-stream requests only'}})
  self.reply(200,{'id':'fixture-response','object':'chat.completion','created':1794614400,'model':model,'choices':[{'index':0,'message':{'role':'assistant','content':'固定测试回答，不是真实推理：P01 与 P02 的环境条件不同，P03 测量指标不同，不能普遍推广。[P01][P02][P03]'},'finish_reason':'stop'}],'usage':{'prompt_tokens':0,'completion_tokens':0,'total_tokens':0}})
if __name__=='__main__':
 print('本地模拟服务 http://127.0.0.1:8765/v1；Ctrl+C 停止；不会连接外网。')
 ThreadingHTTPServer(('127.0.0.1',8765),Handler).serve_forever()
