const listenForRequests = (request: Request): void => {

};

const observer = new MutationObserver((mutations: MutationRecord[], obs: MutationObserver): void => {
  const continueWatching = document.querySelector<HTMLDivElement>(
    'div[data-testid="continue-watching"]'
  );

  if (continueWatching) {
    const metadata = continueWatching.querySelectorAll<HTMLDivElement>('#asset-metadata');

    if (metadata.length > 0) {
      metadata.forEach((asset: HTMLDivElement): void => {
        const contentTarget = asset.querySelector<HTMLAnchorElement>('[data-gv2elementtype="contentId"]');
        const contentId = contentTarget?.getAttribute('data-gv2elementvalue') || null;

        if (!contentId) {
          return;
        }

        const actionsWrapper = asset.querySelector<HTMLButtonElement>('.button')?.closest('span');

        if (actionsWrapper) {
          const removeButton: HTMLButtonElement = document.createElement('button');
          removeButton.classList.add('button', 'button--circle', 'button--circle-24', 'margin--left-4');
          removeButton.style.padding = '3px';
          removeButton.type = 'button';

          const removeIcon: HTMLSpanElement = document.createElement('span');
          removeIcon.classList.add('icon', 'icon--close', 'icon--size-24');

          removeButton.appendChild(removeIcon);
          actionsWrapper.appendChild(removeButton);
        }
      });

      obs.disconnect();
    }
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});
