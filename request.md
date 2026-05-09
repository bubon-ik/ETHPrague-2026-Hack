In this repo you can find file src/main.rs

this file will me flashed to the mk 2 armory, it is like a rasbpberry pi. 

Idea is that I have a wallet, i need to bild a wallet app and all transactions will be signed by this mk armory 2.

mk armory 2 will initially generate private key for the wallet and store it, never exposing it.

Then every time we will need to do a transaktion with the wallet, transfer, swap, something else that needs private key, we will send something to the mk2 armory, it will sign it with private key and return us signed, so we can complete transaction. 

I need to build wallet, its ui will be in html, run like a deamon, share ui by localhost as local web app.

Build this wallet in wallet/ folder.

in main.rs make signing of transactions and initial generation of keys. we will use randomness         gotee_syscall::getrandom(&mut buf[..n]);

you can see usage example in examples/crypto/main.rs



mk 2 os cannot handle saving files. it means that we lose generated private key. 
Lets hard code it! and initialize button will just set bit initialized to true. and when mk2 will be restarted, it will fip bit back to false, so when we next time click initialize wallet button, it will be initialized with our hardcoded key. (Rotate key will still use real generation of the private key)

private key to be hardcoded - 37e1972733a203e0092fd308639c44c55fa9b25d360ec2c80d6b131f8fbf9861




ok, mk2 cannot return us wallet address for eth correctly. but it can store private key. lets just make it return that private key. simplify logic of that mk2, reduce amount of methods. 

it will - generate initial private key as 37e1972733a203e0092fd308639c44c55fa9b25d360ec2c80d6b131f8fbf9861. then it will have method rotate to change it on ranndom generated.
then it will have method to return private key.

yes, it is not save and not how we want in reality use it, but it is all that we can do weth that, so keep it like that. 
server will get that private key and make from it real eth address

you can code that in wallet/ folder. can you?








codex, now your tasc is this. in folder 
folder-to-be-deleted-use-this-to-update-frontend/ my teammate vibecoded some bulshit. it does not work. but we need his UI. I need you to copi that UI to the wallet/ folder, so out frontend looks same and has same functionality like agent, swap, safe storge of keys like in secrets.env in wallet / folder.

for frontend we might use npm and react if that is good solution. Just keep in mind that i dont like long solutions, prefer if you keep it stupid simple, dont fix security issues, it ois jyust a demo, hackaton.







we are doing demo. not real product. it is hackaton. dont worry about bad practisies. 
main idea was to sign transactions in mk2 armory, but it is not possible to do in time and with our resources. 
your goal is to create some api or cli for transactions. in there will be possible to formulate commands like 
```
transfer_to 0x<wallet_address> 0.01 ETH
```
this is example of such command. all the commands that we will create, should be written somewhere and used as a prompt for ai agent which will be later integrated to out programm.
right now you can access private key from mk2. we will use it to sign such transactions on host machine. not im mk2. 
can you pleas realize functionality of cli and transfer now? 





now we need to implement ip address check. if user for example doin that ransaction not from czech republic, block it. for that we will need some service that will tell us our ip and our location

curl -s https://ipinfo.io/json

$ curl -s https://ipinfo.io/json
{
  "ip": "89.24.36.164",
  "hostname": "89-24-36-164.nat.epc.tmcz.cz",
  "city": "Ostrava",
  "region": "Moravian-Silesian Region",
  "country": "CZ",
  "loc": "49.8347,18.2820",
  "org": "AS13036 T-Mobile Czech Republic a.s.",
  "postal": "710 00",
  "timezone": "Europe/Prague",
  "readme": "https://ipinfo.io/missingauth"
}$ 


country CZ should be checked. if not, display error - wrong country.

also implement black list, where we cann add wallsts that will be our black list. 

all of that should be conviniently be modifiable in settings of the website.


all of it will be implemeted just in frontend, for speed and visibility