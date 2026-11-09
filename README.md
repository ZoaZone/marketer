# Digital Studio — digitalstudios.app

AI creative + marketing platform: movie maker, song creator, media editor,
dubbing, social scheduling, funnels, bulk messaging and analytics.

Built on Base44. This project contains everything you need to run the app
locally.

## Authentication note

Google sign-in redirects through the Base44 platform
(`/api/apps/auth/login`), so the Google consent screen shows whichever OAuth
client is configured in **Dashboard → Settings → Authentication → Google**.
To show digitalstudios.app there instead of base44.com, select *"Use a custom
OAuth from Google Console"* and supply a client id/secret from a Google Cloud
project we own. Nothing in this repo can change that screen.

**Edit the code in your local development environment**

Any change pushed to the repo will also be reflected in the Base44 Builder.

**Prerequisites:** 

1. Clone the repository using the project's Git URL 
2. Navigate to the project directory
3. Install dependencies: `npm install`
4. Create an `.env.local` file and set the right environment variables

```
VITE_BASE44_APP_ID=your_app_id
VITE_BASE44_APP_BASE_URL=your_backend_url

e.g.
VITE_BASE44_APP_ID=cbef744a8545c389ef439ea6
VITE_BASE44_APP_BASE_URL=https://my-to-do-list-81bfaad7.base44.app
```

Run the app: `npm run dev`

**Publish your changes**

Open [Base44.com](http://Base44.com) and click on Publish.

**Base44 platform docs & support**

Documentation: [https://docs.base44.com/Integrations/Using-GitHub](https://docs.base44.com/Integrations/Using-GitHub)

Support: [https://app.base44.com/support](https://app.base44.com/support)
