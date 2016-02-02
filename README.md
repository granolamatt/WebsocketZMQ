# WebsocketZMQ
This is a library to connect to zmq servers using websockets and ZMTP.

I tried using <a href="https://github.com/zeromq/zwssock/">ZeroMQ/ZWSSock</a> but I do not like the idea of adding more code to my ZMQ server to interface with the web.  This is a small project that uses <a href="https://github.com/kanaka/websockify">websockify</a> to pass the zmq into the browser and then connect using <a href="http://rfc.zeromq.org/spec:23">ZMTP</a>.

I used websockify's example to set things up.  To run this code simply download the zmq examples from https://github.com/imatix/zguide.  In the examples is the <a href="https://github.com/imatix/zguide/blob/master/examples/C/hwserver.c">hwserver</a> documented <a href="http://zguide.zeromq.org/page:all#Ask-and-Ye-Shall-Receive">here</a>.

Compile and run the hwserver in your language of choice.  Then get <a href="https://github.com/kanaka/websockify">websockify</a> and in the directory execute:
<br></br>
run 22000 localhost:5555
<br></br>
Once <a href="https://github.com/kanaka/websockify">websockify</a> is running then open the <a href="http://rawgit.com/granolamatt/WebsocketZMQ/master/wszmq.html">wszmq.html</a> file.

Simple put in localhost and 22000 in the host and port fields then push connect.  You should see the hwserver.html example run.

