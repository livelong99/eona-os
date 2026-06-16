# Agent OS Q&A — Formatted Transcript
*Source: "New Agent OS is INSANE" — Julian Goldie SEO (720p). Audio narration formatted into sections; wording unchanged.*

---

So, we're getting loads of questions about the agent operating system that we've built inside the air profitable warming community. I thought I'd answer them today because probably if they have questions, you have questions, too. And so, we're going to run through some of the top ones today and talk through exactly how we use our agent operating system to basically automate anything and also to have multiple agents working together all from one single shared memory and one single shared system that works together.

---

## Question 1 — Running Multiple Agents (from Conscience)

And this is the first question that we've got here from conscience. So conscience is saying you know how are you running multiple agents inside the a. So is it designed to support multiple different agents at once? Uh how are you using multiple agents in practice? Have you successfully run several agents at once? Are there settings and modifications that you can do? And how do you personally define what a multiple agent is? So a lot of questions in one there. Let's run through them.

So, usually if I've got separate agents, it depends on what we're doing, but if I want to run like multiple sub agents working together as a team, then the way that I do that is I have the camb board with Hermes agent and then I can build multiple tasks together and I can just plug in one prompt and then it goes off and does here. Right? So, we can plug in one prompt here. It will assign it to my different agent profiles with Hermes. So, we got like GLM judge, GLM SEO, GLM researcher, GLM writer, etc. and then they can go off and just build whatever we want. And so that's pretty powerful because it can like write multiple articles or it could create videos together as a team in one single place.

Now each agent inside the agent OS has its own independent process, right? So for example, you've got Claude and then you got me, you got Kimmy uh all running in their own backend session. So they genuinely run side by side. Switching tabs doesn't stop the others. The work like keeps going in the background. The UI just shows the tab that you're looking at. So if an agent like stops when you switch, that's usually an older build or something like that. Uh but yeah, you can really have like multiple parallel agents working.

And again, Hermes have just shipped a new feature called asynchronous sub agents. And so basically what this means is they have a new delegate tool that fans out workers in the background and no longer blocks what you're doing inside the chat as well. So you can have like one lead agent fanning out multiple different jobs to multiple agents at a time as well. So that's another way to use it. But this is the way that I look at it.

---

## Question 2 — AI Video Generation (from RK)

Next question, AI video generation. Right. So RK is asking about this and basically like how to generate videos with AI in a way that doesn't, you know, take up too much resources and how to organize it, how to get it all set up together, etc. and and what's like the best route for this.

So here's a way that I look at it. If you want something that's kind of like less resource intensive then you can use something like grock awar. So for example we have this studio here we can generate videos and images and voice notes using gro a or minia and we can switch between them inside the tab here. So that's a good option. And then you can also generate hyperframes as well, right? And I know you've put there that hyperframes seems expensive, but it's a free open source skill. So you can give your agents access to hyperframes and then it can go off and create videos for you.

So if we have a look here, for example, this is a section we've created inside the agent operating system just for videos. And you can see that it can create like videos uh you know pretty nice animations like as you can see here. And it can also, for example, create AI avatar videos if you plug that into Hey Genen as well. But if you just want like, you know, videos without an avatar, then you can actually do it for free with your AI agents. So you got two options there. Hyperframes or you can use the studio with Miniax or Grock and Hermes. And if you're already subscribed to Twitter, actually, then you're not paying anything extra because you get Grock access already. And you get Grock build access, too.

---

## Question 3 — Hermes as a Perplexity Computer Replacement (from John)

So this is pretty interesting. John was posting about basically finding a replacement to Plexi computer which is Hermes agent and basically like how to have your own Hermes agent that's a replacement for Plexi computer. So this is really cool.

So you can use Hermes just in the same way, right? It can basically run on a machine. It can do stuff locally. It can work kind of like Perplexi's computer which is a cloud-based computer but you can have Hermes agent running in the background. Another one that we quite like is Google managed agents API because that gives you access to cloud API agents too. And so what you can do is you can have like a crew of managed agents using the managed agents API from Google and then it has its own sandbox access to live web etc. It can run code it can finish files in the cloud and that's pretty cool too. So that's another option.

You can see the details right here, but basically you can plug in a managed agents API into your system and then go from there. The way that we used it previously was with anti-gravity. So basically we plugged in the managed agents API from Gemini inside anti-gravity and then that could do stuff in the cloud for us. So if we check out the managed agents workspace here, you can see some of the stuff that it created, some of the research, etc. And it did this all in the cloud which is pretty crazy. So like you know if you wanted to have an agent but you don't want to set up a VPS that's a potential alternative as well and it's pretty simple and easy and then you can still plug it into agent operating system because you have Google managed agents running through anti-gravity.

By the way if you want me to answer your questions like this feel free to join the air profit for boarding link in the comments in description. And what I do daily is just answer the latest questions create a video tutorial like this and just run through exactly how to implement each part of this.

---

## Question 4 — Agent OS and Claude Code: VPS or Local? (from Chad)

So we got a question from Chad which is agent OS and free claw code where should they live? So currently on his Mac Mini he already has Hermes open claw paperclip obsidian installed and he wasn't sure like do you set this up on a VPS or do you run it locally?

So for me personally I run agent OS locally. I just think it's like better to run it locally than to give it access to your phone or something like that. And if you look at all the problems that OpenCore had previously, they all pretty much came from running it on a VPS, right? All the issues that come with a VPS. So I think like it's better and also it's fastest, it's private, you know, you can set up free APIs with it as well. So that's what I recommend for most people.

I know like people worry, okay, you know, maybe I don't have enough RAM or something like that to run this stuff, but this is pretty lightweight if you're running an agent operating system. You know, Hermes is super lightweight. Claude is lightweight. Like these are all things that can run on a basic laptop. You don't even need a Mac Mini. And then also the only reason that I would see to use a VPS is if you want agent operating system like accessible from your phone or whatever. But I do think that's, you know, you got to be careful with doing that, right? You don't want to give anyone access that shouldn't have access to your AI agents. And some people do set it up on a VPS like John did here. So, if you do want to do that, I'll link to this tutorial right here.

---

## Community Spotlight — UI Customization (from Dan)

Next up, this is pretty cool. This is what I like to see, actually. So, Dan was posting about making a UI adjustment for the agent operating system where basically it's just like easier to navigate, which I really like. So, let's take a look at this.

Basically, what he's done is changed the style. So, this is my version originally over here, and then this is his version. And he actually has his workspaces and the most important stuff at the top. and then the builders at the bottom. And I think that's pretty cool cuz if you're using these workflows over here all the time, they're probably more important than having your CLI on the left hand side.

So, however you want to organize it, you can. But I do like the fact that, you know, if you use an agent operating system, like we give away the zip file inside the agent AR profit boardroom. The great thing about that is you can customize it however you want, which I think is fantastic. You know, I've seen people like, for example, build their own uh philosophy systems and and all sorts of crazy like stuff for personal use when it comes to AI and they've taken the agent operating system and then tweaked it exactly how they want it in terms of the vibe, the feel, the colors even that sort of thing. And this kind of builds on that.

Dan was also posting about like how to build your own stuff into agent OS. So typically the latest things that come out like for example Kimmy code and Kimmy fast mode just dropped recently and we've already built that into our agent operating system but he was talking about like you know you can add little widgets inside here or little tools and that sort of thing and also adding like a save button so that if you update your agent operating system from one version to another then you've got this save option where you can come back and keep everything persistent.

And the way that I look at this is like the agent operating system isn't a fixed app. It's like it's your dashboard. You can add lots of tools or skills. I literally added Grock build with a SEO funnel hive like earlier this week. And so if you use the tool every day, you can wire it in as a tab so it lives next to everything else. So it's like, okay, well, if we do a lot of SEO, let's plug in SEO tab. If we do a lot of video, let's plug in a video tab, you know, and just make it as useful and personalized to you as you can. That's how you get the most out of this stuff.

Dan also shared another tip, which is basically saving chats into your vault, but also checking through the chats and deleting anything that's not useful, right? So, if you're, for example, going back and forth in Hermes, but like some of those chats are not that useful or not that actionable, etc., or you don't need them anymore, you can always delete that stuff as well, which I think makes it more useful, too. So, that's a great tip as well. You know, just you can cut the noise. You can make sure the conversation only carries useful context and just clean up any sort of chats you've had previously inside your agent operating system that are not actually useful.

---

## Question 5 — Best Local Model for Mac Mini M4

Another question we got here, which is what AI agent should I go for with a Mac Mini M4? Okay. Um, basically, what local model would you use with a Mac Mini M4?

Now, personally, I've got the Mac Studio. So, we've got that on M4. You can see the details right here. So, this is M4 Max that we've got with 35 gig of memory. Now, when I actually run local models, it's not good. Like, I don't think local models are great. From everything that I've tested personally, and for me, I literally test everything just to make sure like I'm not missing anything out. And from what I've seen, I just don't find local models that great. Now, you could use, for example, Gemma 4, but even Gemma 42B, which is supposed to be like a lightweight model that came out recently, even that is super slow, especially if I'm running it with a agent that's using a lot of tool calls.

So for me personally, I don't find it that useful. But if it's a case of you're not worried about privacy, but you're worried about like okay resources or tokens, then instead what I would recommend is you just get a free API, right? So you can plug in like Frontier models like Neatron 3 ultra or for example uh step 3.7 Flash or Alpha or N2 into your system. These are all free APIs you can get and they are free but they run in the cloud so they're a lot lot faster when especially if you're running agents. So again I just don't recommend local models. One day it'll get better. Right now not very good.

---

## Question 6 — Hermes Desktop Not Responding (from Mika)

One sec. This is a good question from Mika. So Mika was saying you know hey guys what's the protocol for Hermes desktop? you know, downloaded it, it didn't respond. Slowed the computer to a snail's pace and got like the spinning beach ball icon on Mac. So, do you need to have a Claude subscription as well? How does it work?

Well, the thing that I've seen with Hermes desktop is like just not as useful as it could be, right? And that's why we built the agent operating system, especially cuz like you might be using Claude, you might be using Hermes, but Hermes desktop is cool. Great idea, but it's not that useful if you're using like multiple agents to build stuff. And most people using like a combination of Claude and Hermes from what I've seen everyone do.

So, this is why I use the agent operating system instead of Hermes desktop cuz it's just a bit messy on the integration. Like for example, we can use Hermes with voice inside the agent operating system. But for me personally, when I set it up on desktop, it just didn't work at all. So that's something to bear in mind. And so the way that I would look at this instead is like use the agent operating system. Desktop is definitely better than terminal, but at the same time, it's, you know, it's not that clean. So that's why I prefer the agent operating system. And it actually shows Claude or Hermes, however you want to install it, how to make sure it syncs properly with your agents.

You could, but if you're really insistent on using Hermes desktop for anyone watching, then you could actually ask Claude, okay, listen, I've got Hermes set up. I've got Hermes desktop set up right now. They're not synced. And then just ask it to sync them. And just make sure that you have the GitHub and the documentation plugged into Claude so that it understands exactly how to implement.

---

## Question 7 — Installing Agent OS on Hostinger VPS

Good question on how to install OS on Hostinger, right? Can you use it on a VPS? So, we actually have a full tutorial on how to do that. For me personally, I don't like to run it in a VPS like I mentioned, but if you want to, we have a full tutorial inside the air profit on how to do that.

---

## Question 8 — Using Agent OS for SEO (from Maverick)

Maverick is asking, you know, how to use agent operating system for SEO, right? How to use it for creating content better.

So the way that I do this, if you want web search enabled, you can just give that to your AI agents. So you can give access to firecraw API and that can search the web for you if you want to or you can use lama and that can give you web search too. Now for me personally, what I do is I use the SEO section. So we have a full section inside there and that way I can just give it a keyword, give it a case study and it will auto deploy that content to my website.

---

## Question 9 — Automating Dispatch, Estimating and Collections (from Phillip)

Next question from Phillip. Has anyone automated dispatch estimating and collections? Right. So, can you basically use agents and sync them with the outside world or sync them with a CRM or that sort of thing?

So, it's very unique. I think I've never really seen this before, but I think you could get Claude or Hermes to build it in for you. This is not like an off-the-shelf thing but this is like a custom agent that you could build right so it could do dispatch estimate and collections these are repetitive rules and so you could describe the workflow that you want to Claude and then let it build the agent into or the workflow into the agent operating system.

So for example when I was creating the video agent over here I would just give it the idea and the workflow and then Claude would do all the rest in terms of building it into the system so that we could come back to it and use it later. So that's the way that I recommend it. So what I recommend is you describe the workflow that you want to Claude, ask it to build that into the agent operating system, and then it will ask you for certain web hooks or for certain API access to your CRM, and you can just build it in from there.

Obviously, this is a completely custom agent customized to your business, but that's the way I would approach it. So the same thing that I did when it came to automated SEO and also videos is we used the systems and the workflows built into the agent OS system. And again like the agent OS is completely customizable. So if you need to add more stuff inside it or you need to add your own workflows inside it like you can you can do that. It's no problem. Claude can easily handle that. And also the cool thing is if you spot any like issues with the agent OS, you can just post it like Mike did here and then we'll just fix it for you and post the update as well. So you get new daily updates based on what drops and what we need to fix as well, which is pretty good.

---

## Wrap-Up

So that's basically it. That's all the questions covered. We've answered every question about the agent OS, the multi-agents, the hive, the SEO automations.

So, if you want to get all of this, you can get it inside the AI profit boardroom link in the comments in description or go to the aiprofitboarding.com. If you go to the classroom over here, you can get the agent OS system that we've built. You could build your own, but if you want to get mine and my setup, you can see it was updated today just now. We've got the new zip file right there with all the new stuff we've added to it. You can post questions like we've talked about today and then I'll answer them personally and you also get help from the community as well, which is super useful. And then you also get a community of 3,600 members. So there's a lot of great people to like connect with, make new friends, etc. Inside the map, you can meet people in your local city who are using AI agents just like you.

And then inside the classroom, you get access to all my new trainings like you can see, plus the whole agent OS system, which you can see right here. And every day we just improve this and add new features and make it better and better based on what's released. And also the great thing about this is like you'll never feel behind because every new thing we're on top of it. I'm on top of it personally. And then what I do is I build it into the system. So you don't even need to worry about keeping up with the latest updates because we add new updates inside the system. And then you never feel overwhelmed or have to worry about it because we add this in.

And then also what we do is inside the agent OS zip file, we actually add a change log. So you can see like everything that we've built in, everything that we've changed and everything that we've done so far. So you can see like the progress of the project which I think is a lot of fun as well. So thanks for watching. Hope to see you inside there. Cheers.
