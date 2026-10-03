/**
 * Customer Portal — License Management & Device Activation
 */

document.addEventListener('DOMContentLoaded', () => {
  loadPortalData();

  const generateBtn = document.getElementById('btnGenerateLicense');
  if (generateBtn) {
    generateBtn.addEventListener('click', handleGenerateKey);
  }
});

async function loadPortalData() {
  try {
    const res = await fetch('/api/web/portal');
    const json = await res.json();
    if (!json.status) return;

    renderLicenses(json.data.licenses || []);
  } catch (err) {
    console.error('Error fetching portal data:', err);
  }
}

function renderLicenses(licenses) {
  const tbody = document.getElementById('licenseTableBody');
  if (!tbody) return;

  if (licenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:#94a3b8;">No license keys found.</td></tr>`;
    return;
  }

  tbody.innerHTML = licenses.map(l => {
    const isAvail = l.status === 'available';
    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <code class="license-key-tag">${l.key}</code>
            <button onclick="copyToClipboard('${l.key}')" title="Copy Key" style="background:none;border:none;color:#64748b;cursor:pointer;">
              <i class="fas fa-copy"></i>
            </button>
          </div>
        </td>
        <td style="font-weight:600;color:#0f172a;">${l.assigned_to}</td>
        <td style="color:#64748b;font-size:13px;">${l.device_type}</td>
        <td style="color:#64748b;font-size:13px;">${l.last_sync}</td>
        <td>
          <span style="font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;background:${isAvail ? '#f1f5f9' : '#ecfdf5'};color:${isAvail ? '#64748b' : '#059669'};">
            ${isAvail ? 'Available Slot' : 'Active Register'}
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

async function handleGenerateKey() {
  const stationName = prompt('Enter a name for this register (e.g., "Counter #3", "Patio Bar"):', 'New Checkout Station');
  if (!stationName) return;

  try {
    const res = await fetch('/api/web/portal/generate-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ station_name: stationName, device_type: 'Desktop POS Terminal' })
    });
    const json = await res.json();
    if (json.status) {
      alert(`Success! Generated license key:\n\n${json.data.key}\n\nEnter this key into the POS Terminal setup screen to activate.`);
      loadPortalData();
    }
  } catch (err) {
    alert('Error generating license key');
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert(`Copied license key to clipboard:\n${text}`);
  }).catch(() => {
    prompt('Copy key manually:', text);
  });
}

window.copyToClipboard = copyToClipboard;
