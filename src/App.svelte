<script>
  import { loadSettings, saveSettings, clearSettings } from './lib/settings.js';
  import { loadCachedMeta, refreshMeta, rememberLocal } from './lib/meta.js';
  import { fetchMeta } from './lib/api.js';
  import { getQueue, enqueue, flushQueue } from './lib/queue.js';
  import { processPhoto, photoPreviewUrl } from './lib/photo.js';

  let settings = $state(loadSettings());
  let meta = $state(loadCachedMeta());
  let pending = $state(0);
  let toast = $state(null);
  let submitting = $state(false);
  let photo = $state(null);
  let photoBusy = $state(false);

  // Setup form (two steps: 1 = URL + token, 2 = pick person)
  let setupUrl = $state('');
  let setupToken = $state('');
  let setupPerson = $state('');
  let setupStep = $state(1);
  let setupPeople = $state([]);
  let setupBusy = $state(false);

  // Transaction form
  const today = () => new Date().toISOString().slice(0, 10);
  let form = $state(newForm());

  function newForm(keepDate) {
    return {
      date: keepDate || today(),
      concept: '',
      counterparty: '',
      domain: '',
      origin: '',
      destination: '',
      amount: '',
      notes: '',
    };
  }

  let toastTimer;
  function showToast(message, kind = 'ok') {
    toast = { message, kind, copied: false };
    clearTimeout(toastTimer);
    // Errors stay longer so there is time to tap-to-copy them.
    toastTimer = setTimeout(() => (toast = null), kind === 'error' ? 10000 : 3500);
  }

  async function copyToast() {
    if (!toast) return;
    try {
      await navigator.clipboard.writeText(toast.message);
      toast.copied = true;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (toast = null), 1500);
    } catch {
      /* clipboard unavailable (http or no permission); keep toast visible */
    }
  }

  async function updatePending() {
    pending = (await getQueue()).length;
  }

  async function sync() {
    if (!settings) return;
    const { sent, remaining, error } = await flushQueue();
    pending = remaining;
    if (sent > 0 && remaining === 0) showToast(`Synced ${sent} pending entr${sent === 1 ? 'y' : 'ies'}`);
    if (error && navigator.onLine) {
      showToast(`Sync failed: ${error.message}`, 'error');
    }
    try {
      meta = await refreshMeta();
    } catch {
      /* offline or backend unreachable; cached meta is fine */
    }
  }

  $effect(() => {
    updatePending();
    if (settings) sync();
    const onOnline = () => sync();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  });

  async function setupNext(e) {
    e.preventDefault();
    if (setupBusy) return;
    const scriptUrl = setupUrl.trim();
    const token = setupToken.trim();
    if (!scriptUrl.startsWith('https://script.google.com/')) {
      showToast('URL should be an Apps Script /exec URL', 'error');
      return;
    }
    setupBusy = true;
    try {
      // Doubles as a connectivity/token check before saving anything.
      const data = await fetchMeta({ scriptUrl, token });
      setupPeople = data.people || [];
      if (setupPeople.length === 0) {
        showToast(
          'No people found. Add names to column C of the Config sheet tab (header in C1).',
          'error'
        );
        return;
      }
      if (!setupPeople.includes(setupPerson)) setupPerson = '';
      setupStep = 2;
    } catch (err) {
      showToast(`Could not connect: ${err.message}`, 'error');
    } finally {
      setupBusy = false;
    }
  }

  function saveSetup(e) {
    e.preventDefault();
    const next = {
      scriptUrl: setupUrl.trim(),
      token: setupToken.trim(),
      person: setupPerson,
    };
    if (!next.person) {
      showToast('Pick who is adding transactions', 'error');
      return;
    }
    saveSettings(next);
    settings = next;
    setupStep = 1;
  }

  function reconfigure() {
    if (settings) {
      setupUrl = settings.scriptUrl;
      setupToken = settings.token;
      setupPerson = settings.person || '';
    }
    setupStep = 1;
    clearSettings();
    settings = null;
  }

  async function onPhotoPicked(e) {
    const file = e.target.files[0];
    if (!file) return;
    photoBusy = true;
    try {
      photo = await processPhoto(file);
    } catch (err) {
      showToast(`Photo failed: ${err.message}`, 'error');
    } finally {
      e.target.value = '';
      photoBusy = false;
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    submitting = true;

    const tx = {
      id: crypto.randomUUID(),
      date: form.date,
      concept: form.concept.trim(),
      counterparty: form.counterparty.trim(),
      domain: form.domain,
      origin: form.origin,
      destination: form.destination,
      amount: form.amount === '' ? '' : Number(form.amount),
      notes: form.notes.trim(),
      dateCreated: new Date().toISOString(),
      addedBy: settings.person,
      // $state.snapshot: unwrap the Svelte proxy, IndexedDB can't clone proxies
      ...(photo ? { photo: $state.snapshot(photo) } : {}),
    };

    try {
      await enqueue(tx);
      meta = rememberLocal(meta, tx);
      form = newForm(form.date);
      photo = null;

      const { remaining, error } = await flushQueue();
      pending = remaining;
      if (remaining === 0) {
        showToast('Transaction saved');
      } else if (error && navigator.onLine) {
        showToast(`Queued — sync failed: ${error.message}`, 'error');
      } else {
        showToast(`Saved offline (${remaining} pending)`, 'warn');
      }
    } catch (err) {
      showToast(`Failed to save: ${err.message}`, 'error');
    } finally {
      submitting = false;
    }
  }
</script>

{#if !settings}
  <main>
    <h1>CatFlow setup</h1>
    {#if setupStep === 1}
      <form onsubmit={setupNext}>
        <label>
          Apps Script URL
          <input
            type="url"
            bind:value={setupUrl}
            placeholder="https://script.google.com/macros/s/…/exec"
            required
          />
        </label>
        <label>
          Secret token
          <input type="password" bind:value={setupToken} required />
        </label>
        <button type="submit" disabled={setupBusy}>
          {setupBusy ? 'Connecting…' : 'Next'}
        </button>
        <p class="hint">
          Deploy <code>apps-script/Code.gs</code> as a web app on your sheet and
          set the <code>TOKEN</code> script property. See the README.
        </p>
      </form>
    {:else}
      <form onsubmit={saveSetup}>
        <label>
          Who is adding transactions?
          <select bind:value={setupPerson} required>
            <option value=""></option>
            {#each setupPeople as p (p)}<option value={p}>{p}</option>{/each}
          </select>
        </label>
        <button type="submit">Save</button>
        <button type="button" class="ghost" onclick={() => (setupStep = 1)}>
          Back
        </button>
        <p class="hint">
          People come from column C of the <code>Config</code> sheet tab.
        </p>
      </form>
    {/if}
  </main>
{:else}
  <main>
    <header>
      <h1>CatFlow</h1>
      <div class="header-right">
        {#if pending > 0}
          <button class="badge" onclick={sync} title="Tap to retry sync">
            {pending} pending
          </button>
        {/if}
        <button class="ghost" onclick={reconfigure} aria-label="Settings">⚙</button>
      </div>
    </header>

    <form onsubmit={submit}>
      <label>
        Date
        <input type="date" bind:value={form.date} required />
      </label>

      <label>
        Concept
        <input
          type="text"
          bind:value={form.concept}
          list="concepts"
          autocomplete="off"
          required
        />
        <datalist id="concepts">
          {#each meta.concepts as c (c)}<option value={c}></option>{/each}
        </datalist>
      </label>

      <label>
        Counterparty
        <input
          type="text"
          bind:value={form.counterparty}
          list="counterparties"
          autocomplete="off"
        />
        <datalist id="counterparties">
          {#each meta.counterparties as c (c)}<option value={c}></option>{/each}
        </datalist>
      </label>

      <label>
        Domain
        <select bind:value={form.domain}>
          <option value=""></option>
          {#each meta.domains as d (d)}<option value={d}>{d}</option>{/each}
        </select>
      </label>

      <div class="row">
        <label>
          Origin account
          <select bind:value={form.origin}>
            <option value=""></option>
            {#each meta.accounts as a (a)}<option value={a}>{a}</option>{/each}
          </select>
        </label>

        <label>
          Destination account
          <select bind:value={form.destination}>
            <option value=""></option>
            {#each meta.accounts as a (a)}<option value={a}>{a}</option>{/each}
          </select>
        </label>
      </div>

      <label>
        Amount
        <input
          type="number"
          inputmode="decimal"
          step="0.01"
          bind:value={form.amount}
          required
        />
      </label>

      <label>
        Notes
        <textarea rows="2" bind:value={form.notes}></textarea>
      </label>

      <input
        type="file"
        accept="image/*"
        capture="environment"
        id="receipt-camera"
        onchange={onPhotoPicked}
        hidden
      />
      <input
        type="file"
        accept="image/*"
        id="receipt-gallery"
        onchange={onPhotoPicked}
        hidden
      />
      {#if photo}
        <div class="receipt-row">
          <img src={photoPreviewUrl(photo)} alt="Receipt preview" class="receipt-thumb" />
          <button type="button" class="ghost" onclick={() => (photo = null)}>
            Remove
          </button>
        </div>
      {:else if photoBusy}
        <button type="button" class="ghost" disabled>Processing…</button>
      {:else}
        <div class="receipt-row">
          <button
            type="button"
            class="ghost"
            onclick={() => document.getElementById('receipt-camera').click()}
          >
            📷 Take photo
          </button>
          <button
            type="button"
            class="ghost"
            onclick={() => document.getElementById('receipt-gallery').click()}
          >
            🖼 From gallery
          </button>
        </div>
      {/if}

      <button type="submit" disabled={submitting || photoBusy}>
        {submitting ? 'Saving…' : 'Add transaction'}
      </button>
    </form>
  </main>
{/if}

{#if toast}
  <button type="button" class="toast {toast.kind}" onclick={copyToast}>
    {toast.copied ? 'Copied to clipboard' : toast.message}
    {#if toast.kind === 'error' && !toast.copied}
      <span class="toast-hint">tap to copy</span>
    {/if}
  </button>
{/if}
