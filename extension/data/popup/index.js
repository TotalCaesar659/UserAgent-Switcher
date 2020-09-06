'use strict';

const DCSI = 'firefox-default';

document.body.dataset.android = navigator.userAgent.indexOf('Android') !== -1;

let tab = {};

chrome.tabs.query({
  active: true,
  currentWindow: true
}, tbs => {
  if (tbs.length) {
    tab = tbs[0];
    if ('cookieStoreId' in tab) {
      const apply = document.querySelector('[data-cmd="apply"]');
      apply.value = 'Apply (container)';
      apply.title = 'Set this user-agent string as the current container\'s User-Agent string';

      const w = document.querySelector('[data-cmd="window"]');
      w.value = 'Apply (container on window)';
      w.title = 'Set this user-agent string for all tabs inside the current window\'s container';

      const reset = document.querySelector('[data-cmd="reset"]');
      reset.value = 'Reset (container)';
      reset.title = 'Reset the container\'s user-agent string to the default one. This will not reset window-based UA strings. To reset them, use the \'Restart\' button';
    }
  }
});

const map = {};

function sort(arr) {
  function sort(a = '', b = '') {
    const pa = a.split('.');
    const pb = b.split('.');
    for (let i = 0; i < 3; i++) {
      const na = Number(pa[i]);
      const nb = Number(pb[i]);
      if (na > nb) {
        return 1;
      }
      if (nb > na) {
        return -1;
      }
      if (!isNaN(na) && isNaN(nb)) {
        return 1;
      }
      if (isNaN(na) && !isNaN(nb)) {
        return -1;
      }
    }
    return 0;
  }
  const list = arr.sort((a, b) => sort(a.browser.version, b.browser.version));
  if (document.getElementById('sort').value === 'descending') {
    return list.reverse();
  }
  return list;
}

function get(path) {
  const cf = Promise.resolve({
    match() {
      return Promise.resolve();
    },
    add() {
      return Promise.resolve();
    }
  });
  return (typeof caches !== 'undefined' ? caches : {
    open() {
      return cf;
    }
  }).open('agents').catch(() => cf).then(cache => {
    const link = 'https://cdn.jsdelivr.net/gh/ray-lothian/UserAgent-Switcher/node/' + path;
    // updating agents once per 7 days
    chrome.storage.local.get({
      ['cache.' + path]: 0
    }, prefs => {
      const now = Date.now();
      if (now - prefs['cache.' + path] > 7 * 24 * 60 * 60 * 1000) {
        cache.add(link).then(() => chrome.storage.local.set({
          ['cache.' + path]: now
        }));
      }
    });
    return cache.match(link).then(resp => resp || fetch(path));
  });
}

function update(ua) {
  const browser = document.getElementById('browser').value;
  const os = document.getElementById('os').value;

  const t = document.querySelector('template');
  const parent = document.getElementById('list');
  const tbody = parent.querySelector('tbody');
  tbody.textContent = '';

  parent.dataset.loading = true;
  get('browsers/' + browser.toLowerCase() + '-' + os.toLowerCase().replace(/\//g, '-') + '.json')
    .then(r => r.json()).catch(e => {
      console.error(e);
      return [];
    }).then(list => {
      if (list) {
        const fragment = document.createDocumentFragment();
        let radio;
        for (const o of sort(list)) {
          const clone = document.importNode(t.content, true);
          const second = clone.querySelector('td:nth-child(2)');
          if (o.browser.name && o.browser.version) {
            second.title = second.textContent = o.browser.name + ' ' + (o.browser.version || ' ');
          }
          else {
            second.title = second.textContent = '-';
          }
          const third = clone.querySelector('td:nth-child(3)');
          if (o.os.name && o.os.version) {
            third.title = third.textContent = o.os.name + ' ' + (o.os.version || ' ');
          }
          else {
            third.title = third.textContent = '-';
          }
          const forth = clone.querySelector('td:nth-child(4)');
          forth.title = forth.textContent = o.ua;
          if (o.ua === ua) {
            radio = clone.querySelector('input[type=radio]');
          }
          fragment.appendChild(clone);
        }
        tbody.appendChild(fragment);
        if (radio) {
          radio.checked = true;
          radio.scrollIntoView({
            block: 'center',
            inline: 'nearest'
          });
        }
        document.getElementById('custom').placeholder = `Filter among ${list.length}`;
        [...document.getElementById('os').querySelectorAll('option')].forEach(option => {
          option.disabled = (map.matching[browser.toLowerCase()] || []).indexOf(option.value.toLowerCase()) === -1;
        });
      }
      else {
        throw Error('OS is not found');
      }
    // FF 55.0 does not support finally
    }).catch(() => {}).then(() => {
      parent.dataset.loading = false;
    });
}

document.getElementById('browser').addEventListener('change', e => chrome.storage.local.set({
  'popup-browser': e.target.value
}));
document.getElementById('os').addEventListener('change', e => chrome.storage.local.set({
  'popup-os': e.target.value
}));
document.getElementById('sort').addEventListener('change', e => chrome.storage.local.set({
  'popup-sort': e.target.value
}));

document.addEventListener('change', ({target}) => {
  if (target.closest('#filter')) {
    chrome.storage.local.get({
      ua: ''
    }, prefs => update(prefs.ua || navigator.userAgent));
  }
  if (target.type === 'radio') {
    document.getElementById('ua').value = target.closest('tr').querySelector('td:nth-child(4)').textContent;
    document.getElementById('ua').dispatchEvent(new Event('input'));
  }
});

document.addEventListener('DOMContentLoaded', () => fetch('./map.json').then(r => r.json()).then(o => {
  Object.assign(map, o);

  const f1 = document.createDocumentFragment();
  for (const browser of map.browser) {
    const option = document.createElement('option');
    option.value = option.textContent = browser;
    f1.appendChild(option);
  }
  const f2 = document.createDocumentFragment();
  for (const os of map.os) {
    const option = document.createElement('option');
    option.value = option.textContent = os;
    f2.appendChild(option);
  }

  document.querySelector('#browser optgroup:last-of-type').appendChild(f1);
  document.querySelector('#os optgroup:last-of-type').appendChild(f2);

  chrome.storage.local.get({
    'popup-browser': 'Chrome',
    'popup-os': 'Windows',
    'popup-sort': 'descending'
  }, prefs => {
    document.getElementById('browser').value = prefs['popup-browser'];
    document.getElementById('os').value = prefs['popup-os'];
    document.getElementById('sort').value = prefs['popup-sort'];

    chrome.runtime.getBackgroundPage(bg => {
      // Firefox in private mode -> there is no bg!
      const ua = (bg ? bg.prefs.ua : '') || navigator.userAgent;
      update(ua);
      document.getElementById('ua').value = ua;
      document.getElementById('ua').dispatchEvent(new Event('input'));
    });
  });
}));

document.getElementById('list').addEventListener('click', ({target}) => {
  const tr = target.closest('tbody tr');
  if (tr) {
    const input = tr.querySelector('input');
    if (input && input !== target) {
      input.checked = true;
      input.dispatchEvent(new Event('change', {
        bubbles: true
      }));
    }
  }
});

document.getElementById('custom').addEventListener('keyup', ({target}) => {
  const value = target.value;
  [...document.querySelectorAll('#list tbody tr')]
    .forEach(tr => tr.dataset.matched = tr.textContent.toLowerCase().indexOf(value.toLowerCase()) !== -1);
});

chrome.storage.onChanged.addListener(prefs => {
  if (prefs.ua) {
    document.getElementById('ua').value = prefs.ua.newValue || navigator.userAgent;
    document.getElementById('ua').dispatchEvent(new Event('input'));
  }
});

function msg(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  window.setTimeout(() => toast.textContent = '', 2000);
}

// commands
document.addEventListener('click', ({target}) => {
  const cmd = target.dataset.cmd;
  if (cmd) {
    if (cmd === 'apply') {
      const value = document.getElementById('ua').value;
      if (value === navigator.userAgent) {
        msg('Default UA, press the reset button instead');
      }
      else {
        msg('User-Agent is Set');
      }
      if (value !== navigator.userAgent) {
        // prevent a container ua string from overwriting the default one
        if ('cookieStoreId' in tab && tab.cookieStoreId !== DCSI) {
          chrome.runtime.getBackgroundPage(bg => bg.ua.update(value, undefined, tab.cookieStoreId));
          chrome.storage.local.get({
            'container-uas': {}
          }, prefs => {
            prefs['container-uas'][tab.cookieStoreId] = value;
            chrome.storage.local.set(prefs);
          });
        }
        else {
          chrome.storage.local.set({
            ua: value
          });
        }
      }
    }
    else if (cmd === 'window') {
      const value = document.getElementById('ua').value;
      chrome.runtime.getBackgroundPage(bg => bg.ua.update(value, tab.windowId, tab.cookieStoreId));
    }
    else if (cmd === 'reset') {
      const input = document.querySelector('#list :checked');
      if (input) {
        input.checked = false;
      }
      // prevent a container ua string from overwriting the default one
      if ('cookieStoreId' in tab && tab.cookieStoreId !== DCSI) {
        chrome.runtime.getBackgroundPage(bg => {
          delete bg.ua._obj[tab.cookieStoreId];
          bg.ua.update('', undefined, tab.cookieStoreId);
        });
        chrome.storage.local.get({
          'container-uas': {}
        }, prefs => {
          delete prefs['container-uas'][tab.cookieStoreId];
          chrome.storage.local.set(prefs);
        });

        msg('Disabled on this container. Uses the default user-agent string');
      }
      else {
        chrome.storage.local.set({
          ua: ''
        });
        msg('Disabled. Uses the default user-agent string');
      }
    }
    else if (cmd === 'refresh') {
      chrome.tabs.query({
        active: true,
        currentWindow: true
      }, ([tab]) => chrome.tabs.reload(tab.id, {
        bypassCache: true
      }));
    }
    else if (cmd === 'options') {
      chrome.runtime.openOptionsPage();
    }
    else if (cmd === 'reload') {
      chrome.runtime.reload();
    }
    else if (cmd === 'test') {
      chrome.storage.local.get({
        'test': 'https://webbrowsertools.com/useragent/?method=normal&verbose=false'
      }, prefs => chrome.tabs.create({
        url: prefs.test
      }));
    }

    if (cmd) {
      target.classList.add('active');
      window.setTimeout(() => target.classList.remove('active'), 500);
    }
  }
});

document.getElementById('ua').addEventListener('input', e => {
  const value = e.target.value;
  document.querySelector('[data-cmd=apply]').disabled = value === '';
  document.querySelector('[data-cmd=window]').disabled = value === '';

  if (value) {
    chrome.runtime.getBackgroundPage(bg => {
      const o = bg.ua.parse(value);
      document.getElementById('appVersion').value = o.appVersion;
      document.getElementById('platform').value = o.platform;
      document.getElementById('vendor').value = o.vendor;
      document.getElementById('product').value = o.product;
      document.getElementById('oscpu').value = o.oscpu;
    });
  }
});
document.getElementById('ua').addEventListener('keyup', e => {
  if (e.key === 'Enter') {
    document.querySelector('[data-cmd="apply"]').click();
  }
});

/* container support */
document.querySelector('[data-cmd="container"]').addEventListener('click', e => {
  chrome.permissions.request({
    permissions: ['cookies']
  }, granted => {
    if (granted) {
      window.close();
    }
  });
});
if (/Firefox/.test(navigator.userAgent)) {
  chrome.permissions.contains({
    permissions: ['cookies']
  }, granted => {
    if (granted === false) {
      document.querySelector('[data-cmd="container"]').classList.remove('hide');
    }
  });
}
