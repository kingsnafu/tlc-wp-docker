/**
 * Async form submission handler for wp-to-static generated forms.
 * Collects form data, POSTs as JSON to the Worker endpoint,
 * and shows success/error feedback.
 */
(function () {
  document.querySelectorAll('form[data-form-handler]').forEach(function (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      const handler = form.getAttribute('data-form-handler');
      if (!handler || handler === '#') return;

      const btn = form.querySelector('[type="submit"]');
      const status = form.querySelector('.gform-status');
      const originalText = btn.textContent;

      btn.disabled = true;
      btn.textContent = 'Sending...';
      if (status) {
        status.textContent = '';
        status.className = 'gform-status';
      }

      // Collect form data as JSON object (skip file inputs — not supported)
      const formData = new FormData(form);
      const data = {};
      var hasFiles = false;
      formData.forEach(function (value, key) {
        if (value instanceof File || value instanceof Blob) {
          hasFiles = true;
          return;
        }
        // Handle checkbox arrays (name ends with [])
        if (key.endsWith('[]')) {
          const cleanKey = key.slice(0, -2);
          if (!data[cleanKey]) data[cleanKey] = [];
          data[cleanKey].push(value);
        } else {
          data[key] = value;
        }
      });

      if (hasFiles) {
        if (status) {
          status.textContent = 'File uploads are not supported. Please remove file attachments and try again.';
          status.className = 'gform-status gform-error';
        }
        btn.disabled = false;
        btn.textContent = originalText;
        return;
      }

      try {
        var res = await fetch(handler, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        var result = await res.json().catch(function () { return {}; });

        if (res.ok && result.success) {
          if (status) {
            status.textContent = 'Thank you! Your message has been sent.';
            status.className = 'gform-status gform-success';
          }
          form.reset();
        } else {
          if (status) {
            status.textContent = result.error || 'Something went wrong. Please try again.';
            status.className = 'gform-status gform-error';
          }
        }
      } catch (err) {
        if (status) {
          status.textContent = 'Network error. Please check your connection and try again.';
          status.className = 'gform-status gform-error';
        }
      }

      btn.disabled = false;
      btn.textContent = originalText;
    });
  });
})();
