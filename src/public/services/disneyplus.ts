interface ContinueWatchingMediaMetadata {
  mediaId: string;
  runtimeMillis: number;
}

interface ContinueWatching {
  items: Record<string, ContinueWatchingItem>;
}

interface ContinueWatchingItem {
  contentId: string;
  mediaMetadata: ContinueWatchingMediaMetadata;
}

const URL_MATCHES = [
  'https://disneyplus.com/',
  'https://disneyplus.com/home',
  'https://www.disneyplus.com/',
  'https://www.disneyplus.com/home',
];

const REMOVE_BUTTON_CLASS = 'continue-watching__remove';

let authHeader = '';
const continueWatching: ContinueWatching = {
  items: {},
};

const oldXHROpen = window.XMLHttpRequest.prototype.open;
const oldXHRSetRequestHeader = window.XMLHttpRequest.prototype.setRequestHeader;

window.XMLHttpRequest.prototype.setRequestHeader = function setRequestHeader(
  name: string,
  value: string,
) {
  if (name.toLowerCase() === 'authorization') {
    authHeader = `Bearer ${value}`;
  }

  // @ts-ignore
  return oldXHRSetRequestHeader.apply(this, arguments);
};

window.XMLHttpRequest.prototype.open = function open() {
  this.addEventListener('load', function handleLoad() {
    if (this.responseURL.includes('svc/content/ContinueWatching')) {
      const { data } = JSON.parse(this.responseText);

      data.ContinueWatchingSet?.items?.forEach((item: ContinueWatchingItem): void => {
        continueWatching.items[item.contentId] = {
          contentId: item.contentId,
          mediaMetadata: {
            mediaId: item.mediaMetadata.mediaId,
            runtimeMillis: item.mediaMetadata.runtimeMillis,
          },
        };
      });
    }
  });

  // @ts-ignore
  return oldXHROpen.apply(this, arguments);
};

const sendRemoveRequest = (contentId: string): Promise<Response> => {
  const body = JSON.stringify([
    {
      server: {
        fguid: 'unknown',
        mediaId: continueWatching.items[contentId].mediaMetadata.mediaId,
      },
      client: {
        event: 'urn:dss:telemetry-service:event:stream-sample',
        timestamp: (new Date()).getTime(),
        play_head: continueWatching.items[contentId].mediaMetadata.runtimeMillis / 1000,
        playback_session_id: 'unknown',
        bitrate: 50,
        interaction_id: 'unknown',
      },
    },
  ]);

  return fetch('https://disney.api.edge.bamgrid.com/telemetry', {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body,
  });
};

const createRemoveButton = (contentId: string): HTMLButtonElement => {
  const removeButton: HTMLButtonElement = document.createElement('button');
  removeButton.classList.add('button', 'button--circle', 'button--circle-24', 'margin--left-4', REMOVE_BUTTON_CLASS);
  removeButton.style.padding = '3px';
  removeButton.type = 'button';
  removeButton.setAttribute('data-content-id', contentId);
  removeButton.addEventListener('click', (evt: MouseEvent): void => {
    evt.stopPropagation();

    if (continueWatching.items[contentId]) {
      sendRemoveRequest(contentId)
        .then((): void => removeButton.closest('.slick-slide')?.remove());
    }
  });

  const removeIcon: HTMLSpanElement = document.createElement('span');
  removeIcon.classList.add('icon', 'icon--close', 'icon--size-24');

  removeButton.appendChild(removeIcon);

  return removeButton;
};

const observer = new MutationObserver((
  mutations: MutationRecord[],
  obs: MutationObserver,
): void => {
  const section = document.querySelector<HTMLDivElement>('div[data-testid="continue-watching"]');

  if (section) {
    const assetMetadata = section.querySelector<HTMLDivElement>('#asset-metadata');

    if (assetMetadata) {
      const assets = section.querySelectorAll<HTMLDivElement>('#asset-metadata');

      assets.forEach((asset: HTMLDivElement): void => {
        const contentId = asset.closest<HTMLAnchorElement>('a[data-gv2elementtype="contentId"]')
          ?.getAttribute('data-gv2elementvalue');

        const actionsWrapper = asset.querySelector<HTMLButtonElement>('.button')?.closest('span');

        if (contentId && actionsWrapper) {
          if (!actionsWrapper.querySelector<HTMLButtonElement>(`.${REMOVE_BUTTON_CLASS}`)) {
            actionsWrapper.appendChild(createRemoveButton(contentId));
          }
        }
      });

      obs.disconnect();
    }
  }
});

const startMainObserver = (): void => {
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
};

startMainObserver();

let originalHref = document.location.href;

const locationObserver = new MutationObserver((): void => {
  if (originalHref !== document.location.href) {
    URL_MATCHES.forEach((pattern: string): void => {
      if (document.location.href.startsWith(pattern.trim())) {
        originalHref = document.location.href;
        startMainObserver();
      }
    });
  }
});

locationObserver.observe(document, {
  childList: true,
  subtree: true,
});
