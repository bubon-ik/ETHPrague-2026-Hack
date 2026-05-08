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
