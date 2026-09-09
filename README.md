# Household Budget

A private shared household budget built with React, TypeScript, Firebase Authentication, and Cloud Firestore. The frontend is static and can be hosted from a public GitHub repository; access to budget data is enforced by Firebase, not by hiding the site URL.

## How the pieces fit together

You do not need to run a server for this application. The browser downloads the React frontend from GitHub Pages and talks directly to Firebase:

- **Firebase Authentication** checks the email and password.
- **Cloud Firestore** stores the shared transactions.
- **Firestore Security Rules** decide whether a signed-in person may read or change data.
- The `households/main` document contains the only two approved user IDs.
- GitHub Pages hosts the frontend files; it does not protect the data.

The Firebase web configuration is an identifier for the project, not a password. It is normal for those values to appear in browser code. The actual protection comes from Authentication and Firestore Rules. Never commit a service-account JSON file, private key, password, or API secret.

## Firebase setup for beginners

Complete these steps once before entering real budget data.

### 1. Create a Firebase project

1. Open <https://console.firebase.google.com/> and sign in with your Google account.
2. Click **Create a project**.
3. Give it a name such as `family-budget`.
4. Google Analytics is optional for this app. You can turn it off while creating the project.
5. Click **Create project**, then **Continue**.

Keep the Firebase project name separate from the GitHub repository name if that makes it easier to recognize. They do not need to match.

### 2. Register the website application

1. On the Firebase project overview page, click the **Web** icon, which looks like `</>`.
2. Enter an app nickname such as `household-budget-web`.
3. Do not enable Firebase Hosting; GitHub Pages will host this frontend.
4. Click **Register app**.
5. Firebase displays an object named `firebaseConfig`. You will copy the values into `.env.local` in a later step. Do not download a service-account key.

The values map to environment variables like this:

| Firebase config field | Environment variable |
| --- | --- |
| `apiKey` | `VITE_FIREBASE_API_KEY` |
| `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `VITE_FIREBASE_PROJECT_ID` |
| `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` |
| `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
| `appId` | `VITE_FIREBASE_APP_ID` |

### 3. Enable email and password login

1. In the left Firebase menu, open **Build -> Authentication**.
2. Click **Get started** if Firebase shows that button.
3. Open the **Sign-in method** tab.
4. Select **Email/Password**.
5. Turn on the first **Email/Password** switch. Leave passwordless email link sign-in off.
6. Click **Save**.

Only accounts that you create in the Firebase Authentication Users page can sign in. Do not enable public account creation in the application; this app only exposes sign-in.

### 4. Create the two approved accounts

Create both accounts before creating the membership document:

1. In **Authentication -> Users**, click **Add user**.
2. Enter the first household email address and a strong temporary password.
3. Click **Add user**.
4. Repeat for the second household email address.
5. In the users table, copy the **User UID** for each account. It is a long string such as `abc123...`; it is not the email address.

Give each person their password privately. Passwords are managed by Firebase and must not be written in this repository or in `.env.local`.

### 5. Create the Firestore database

1. In the left menu, open **Build -> Firestore Database**.
2. Click **Create database**.
3. Choose a Firestore location near where you live. This choice cannot easily be changed later.
4. Choose **Start in production mode**.
5. Click **Create**.

Production mode is intentional: no one should be able to read data until the rules below are installed.

### 6. Create the household membership document

The application uses one small document to identify the two allowed users. This document is not a transaction and should never be edited by the web app.

1. In Firestore, open the **Data** tab.
2. Click **Start collection**.
3. For **Collection ID**, enter exactly `households`.
4. For the first document ID, choose **Custom ID** and enter exactly `main`.
5. Add a field with:
   - Field: `memberUids`
   - Type: `array`
   - Array values: add the two copied User UID strings, one per array item
6. Click **Save**.

The resulting document must be:

```text
households / main
  memberUids: ["UID_OF_FIRST_PERSON", "UID_OF_SECOND_PERSON"]
```

Do not put email addresses in `memberUids`, and do not add a document that lets either user edit this array from the application.

### 7. Install the Firebase configuration locally

In the project folder, copy the example file:

```powershell
Copy-Item .env.example .env.local
```

Open `.env.local` and replace every `replace-me` or `your-project` value with the corresponding value from the `firebaseConfig` object shown when you registered the web app:

```text
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

Do not add quotation marks unless the value itself contains them. Restart the Vite dev server after changing `.env.local`; Vite reads environment variables when it starts.

### 8. Publish the Firestore rules

The repository contains the rules in `firestore.rules`. The easiest beginner option is:

1. Open **Firestore Database -> Rules** in the Firebase console.
2. Replace the editor contents with the contents of the repository's `firestore.rules` file.
3. Click **Publish**.

The rules mean:

- A signed-out browser cannot read or write the membership document or transactions.
- A signed-in account is allowed only when its UID appears in `households/main.memberUids`.
- Members can read and delete transactions.
- Members can create or update only records with a valid type, positive amount, category for expenses, and consistent `total = amount + savings`.
- The membership document cannot be written through the app.

For repeatable deployments, install the Firebase CLI instead:

```powershell
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules
```

When `firebase use --add` asks which project to use, select the Firebase project you just created. The CLI may create a `firebase.json` file; that file is configuration, not a secret. If you deploy rules from the console instead, the CLI commands are optional.

### 9. Run and test locally

From the project folder:

```powershell
npm install
npm run dev
```

Open the local URL Vite prints, usually `http://localhost:5173`. Sign in with one of the two Firebase users. Add a Food expense of `105`; the form should show `11` savings and a `116` deduction.

Test the security boundary manually:

1. Open the app in a private browser window while signed out. You should see the sign-in screen.
2. Sign in with each approved account and confirm both accounts see the same transaction.
3. Create a temporary third Firebase user, sign in as that user, and confirm Firestore rejects access. Delete the temporary user afterward.
4. In Firebase **Firestore -> Rules -> Rules Playground**, test a signed-out read and a signed-in non-member read. Both should be denied.

The automated checks can be run with:

```powershell
npm test
npm run build
npm run lint
```

## Data model

Each transaction is stored in the `transactions` collection with this shape:

```text
{
  date: string,             // local calendar date: YYYY-MM-DD
  type: "Income" | "Expense",
  category: string,         // empty for income
  description: string,
  source: string,
  amount: number,           // original entered whole BDT amount
  savings: number,          // whole BDT: ceil(amount * .10), except Tax/Donation/income
  total: number,            // whole BDT: amount + savings
  createdBy: string,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

The UI calculates savings before writing, while the Firestore rules reject malformed writes. For a higher-assurance deployment, add a Cloud Function to recompute `savings` and `total` server-side; never grant clients permission to modify the household membership document.

Category limits are stored separately in `budgets/main` so changing a limit never rewrites transaction history:

```text
budgets / main
  budgets: {
    Food: 15000,
    Fuel: 8000,
    Internet: 2000
  }
```

Budget values are monthly, whole BDT amounts. A missing or zero value means that category has no limit. Either approved household user can update the shared limits; unauthenticated users and non-members cannot read or write them.

## Manually deleting a month

The app never deletes a month automatically. To remove an old month:

1. Sign in as one of the two approved household users.
2. Switch the dashboard month picker to the month you want to remove.
3. In **Transaction history**, click **Delete [selected month]**.
4. Read the warning and type `DELETE` exactly into the confirmation prompt.
5. Confirm the prompt. Every transaction whose stored `date` begins with that selected `YYYY-MM` value is permanently deleted.

If you cancel the prompt or type anything other than `DELETE`, nothing is deleted. The action is disabled when the selected month has no transactions. Firestore permissions still apply: only an authenticated household member can perform the deletion. The operation is batched in groups so a month with many transactions can be removed safely.

## GitHub Pages deployment

The repository includes a GitHub Actions workflow in `.github/workflows/deploy.yml`. It builds the app and publishes the `dist` folder. You do not need a GitHub server or a Firebase service account for this workflow.

1. Create a new **public** repository on <https://github.com/>. A public repository is compatible with the Firebase web configuration because those values are not passwords.
2. Push this project to the repository. From the project folder, the commands are:

  ```powershell
  git init
  git add .
  git commit -m "Build household budget app"
  git branch -M main
  git remote add origin https://github.com/YOUR_GITHUB_NAME/YOUR_REPOSITORY.git
  git push -u origin main
  ```

  If this project is already connected to a remote repository, skip `git init` and `git remote add origin`.
3. On GitHub, open the repository and go to **Settings -> Pages**. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Go to **Settings -> Secrets and variables -> Actions -> Variables**. Click **New repository variable** once for each of these names and paste the matching value from `firebaseConfig`:

  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_STORAGE_BUCKET`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`
  - `VITE_FIREBASE_APP_ID`

  These are intentionally **Variables**, not Secrets, because Firebase web configuration is expected to be visible in the browser. Do not put passwords or service-account credentials in these fields.
5. Push a new commit to `main`, or open **Actions**, select **Deploy to GitHub Pages**, and click **Run workflow**. Wait for the workflow to finish.
6. In **Settings -> Pages**, copy the published URL. It will usually look like `https://YOUR_GITHUB_NAME.github.io/YOUR_REPOSITORY/`.
7. Return to Firebase **Authentication -> Settings -> Authorized domains** and add the hostname only, without `https://` or a path. For example, add `YOUR_GITHUB_NAME.github.io`. Keep `localhost` in the list for local development.
8. Open the published GitHub Pages URL and sign in with one of the two Firebase users.

The workflow builds with the Firebase values supplied by GitHub Actions. If the deployment shows the preview notice instead of the sign-in screen, one or more repository variables is missing or misspelled. If sign-in reports an unauthorized domain, add the exact GitHub Pages hostname to Firebase Authorized domains.

The app shows a local preview with sample data when Firebase environment variables are absent. Treat that only as a UI preview; configure Firebase before entering real data. With Firebase configured, unauthenticated visitors see the sign-in screen and cannot access Firestore data.

## Security verification checklist

- Sign out and confirm the app returns to the sign-in screen.
- Try the app with a non-member Firebase account and confirm Firestore returns `permission-denied`.
- Sign in as both approved accounts and confirm each sees the same transaction list and edits.
- Confirm the `households/main` document is readable only by its listed members and is not writable from the client.
- Confirm no `.env.local`, service-account JSON, passwords, or private keys are tracked by Git.
