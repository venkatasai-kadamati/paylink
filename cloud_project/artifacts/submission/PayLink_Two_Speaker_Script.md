# PayLink on AWS — two-speaker presentation

**Target:** about 8 minutes of explanation + 4 minutes for the demo. Hard stops: 5 minutes for the demo and 15 minutes total. Open [live PayLink](https://dza8myi3womws.cloudfront.net) in two separate browser profiles before presenting. Use only the demo profiles and fictional amounts. Keep the verified screenshots ready as a fallback.

## Slides 1–3 · 0:00–1:20 · Sai

**Sai:** “Think about the last time you split lunch with somebody. The button says ‘Send,’ but behind it the application has to do three things correctly: check that it’s really you, move the right amount, and record what happened so both people see the same result. That’s what we built with PayLink. It’s a simulation, so the money and banks are fictional.”

“You can open an account, send a payment, or invite someone to share an account. The activity screen lets you see the receipt and export your history. If somebody sends you the wrong amount, you can return it without losing the original record. We wanted to test those actions through a real AWS deployment, not just make sure a landing page loaded.”

“Siddhardth, what actually changes when I press Send?”

## Slides 4–5 · 1:20–2:40 · Siddhardth

**Siddhardth:** “Two ledger entries are written: the debit from your account and the credit to mine. If you send me twelve dollars and thirty-four cents, that’s minus 1,234 cents on your side and plus 1,234 on mine. We use integer cents and a single PostgreSQL transaction. Either both balances and both postings change, or none of them do.”

“Suppose your connection drops after you click. The same request key lets the database recognize the retry. It returns the first transfer instead of sending the money twice. A return works differently: it creates a second transfer in the opposite direction and links it to the original. And joint ownership is two holder records for one account, not two copies of the balance.”

“The browser talks to one address. Next.js serves the interface, and FastAPI receives the API calls and talks to PostgreSQL. Sai, can you take us through how those three pieces are connected in AWS?”

## Slides 6–8 · 2:40–4:15 · Sai

**Sai:** “Follow the arrow from the top. Your browser lands at CloudFront over HTTPS. CloudFront takes the request through its private VPC origin to one internal load balancer. It’s one load balancer across two zones, not a separate load balancer in each zone.”

“The default route goes to Next.js on port 3000. The API path goes to FastAPI on port 8000. The tasks have private addresses, and the database is in a different subnet tier. Only the backend security group can reach port 5432.”

“That NAT box is for outbound connections from the private subnets; it isn’t the path from the browser into the application. We used one NAT for the rehearsal to cut fixed cost. It also means we don’t have independent outbound access in both zones.”

“We kept Next.js in a container because it runs as a server here. An S3 bucket could serve static files, but it wouldn’t run that server. Our S3 bucket is for Terraform state, not the frontend.”

## Slide 9 · 4:15–5:15 · Siddhardth

**Siddhardth:** “Terraform first created the network and managed services with zero running app tasks. We pushed three ARM64 images to ECR—frontend, API and bootstrap. The bootstrap applied the migrations and loaded synthetic data into RDS. We waited for it to exit successfully before starting the two services.”

“The bootstrap and the API don’t share an owner login. The bootstrap can change the schema. FastAPI runs with a restricted database role and uses controlled functions for transfers. It can’t directly rewrite account balances.”

“Now let’s see what that rollout gives us in the browser.”

## Slide 10 · 5:15–9:15 · Live demo

**Sai (about 2 minutes):** “[Open the live link and choose **Sign in as Sai**.] This is the same CloudFront address from the diagram. Here’s the workspace. [Reload.] I’m still signed in. I’ll choose **Send money**, find Siddhardth and enter a small amount, like a dollar. [Pause at review.] Notice that we can check the recipient and amount before committing. [Confirm.] Here’s the completed transfer and its receipt.”

**Siddhardth (about 2 minutes):** “[Switch to the second browser profile and sign in as Siddhardth.] I can see Sai’s payment from my side. [Open the activity details and use **Return this payment** if available.] The return isn’t a delete. It gets its own entry, and both sides can still see what happened. [Open **Insights** and point out the cash-flow chart.] The same stored account activity feeds this view.”

**Sai, if time permits:** “The joint-account example is similar: a person doesn’t get access just because an invite exists. They have to accept it.” [Show a prepared invitation or the verified joint-account screenshot; skip if it would run past 4 minutes.]

*Fallback:* If the live URL or shared demo data is unavailable, use the verified transfer review, completed transfer, returned payment and joint-account screenshots. Say that they’re rehearsal captures. Don’t use personal data, try other credentials, or improvise database edits.

## Slides 11–12 · 9:15–10:35 · Sai

**Sai:** “The demo shows one success path. Our live checks also tried a wrong password, a signed-out account request, insufficient funds, an invalid amount and a repeated transfer request. For the test payment of $12.34, we checked the history after reload and the downloaded CSV. The recipient’s return restored both test balances to $200.”

“We checked below the API too. A one-off task inside the VPC ran a read-only RDS query. It found one original for the request key, four postings across the payment and the return, two joint holders, and zero unbalanced transfers or unreconciled accounts. That’s stronger evidence than a green health endpoint.”

“The practical lesson was to test the release environment. Docker Hub rate-limited our pulls, so we used a mirror. AWS also reset a Terraform TLS override on the managed CloudFront hostname. We removed that unsupported override and reviewed the service plan again before applying it.”

## Slides 13–15 · 10:35–12:05 · Siddhardth, then Sai

**Siddhardth:** “We chose Fargate over EC2 so we wouldn’t have a VM or AMI to maintain. We chose isolated RDS over an external database and used CloudWatch for logs, dashboard metrics and alarms. For the low-volume rehearsal we estimate about eighty-eight dollars per month before credits if we leave it running all month. NAT and the public IPv4 address are the biggest single line item.”

“There’s one frontend and one API task in the rehearsal. The API can scale to two. The configuration supports more tasks and a Multi-AZ database, but we didn’t run that profile, force a failover or time recovery. Those are the next experiments.”

**Sai:** “We wanted to prove both that the AWS path works and that the application’s account history stays correct across that path. We verified both on the running rehearsal. Thanks—we’re happy to take questions.”
