// Contact Form Modal — FuturOne
(function() {
  // Create modal HTML — hidden by default with inline style
  var modalHTML = '' +
    '<div id="contactModal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);z-index:9999;align-items:center;justify-content:center;">' +
    '<div class="modal">' +
    '<button class="modal-close" onclick="closeContactModal()">&times;</button>' +
    '<div id="contactFormContent">' +
    '<h2>Get in Touch</h2>' +
    '<p class="modal-subtitle">Tell us about your team and what you\'re looking to build. We\'ll get back to you within one business day.</p>' +
    '<form id="contactFormEl" action="https://formsubmit.co/hello@futurmix.one" method="POST">' +
    '<input type="hidden" name="_subject" value="FuturOne Lead Inquiry">' +
    '<input type="hidden" name="_captcha" value="false">' +
    '<input type="hidden" name="_template" value="table">' +
    '<input type="hidden" name="_next" value="' + window.location.href + '">' +
    '<input type="text" name="_honey" style="display:none">' +
    '<div class="form-group">' +
    '<label for="contact-name">Name</label>' +
    '<input type="text" id="contact-name" name="name" placeholder="Your full name" required>' +
    '</div>' +
    '<div class="form-group">' +
    '<label for="contact-email">Work Email</label>' +
    '<input type="email" id="contact-email" name="email" placeholder="you@company.com" required>' +
    '</div>' +
    '<div class="form-group">' +
    '<label for="contact-company">Company</label>' +
    '<input type="text" id="contact-company" name="company" placeholder="Company name">' +
    '</div>' +
    '<div class="form-group">' +
    '<label for="contact-interest">Interested In</label>' +
    '<select id="contact-interest" name="interest">' +
    '<option value="">Select an option</option>' +
    '<option value="strategy">Strategy &amp; Analysis Agents</option>' +
    '<option value="content">Content Production Agents</option>' +
    '<option value="code">Code &amp; Engineering Agents</option>' +
    '<option value="research">Research &amp; Due Diligence Agents</option>' +
    '<option value="enterprise">Enterprise Plan</option>' +
    '<option value="other">Other</option>' +
    '</select>' +
    '</div>' +
    '<div class="form-group">' +
    '<label for="contact-message">Message</label>' +
    '<textarea id="contact-message" name="message" placeholder="Tell us about your use case..." rows="3"></textarea>' +
    '</div>' +
    '<button type="submit" class="form-submit">Send Message</button>' +
    '</form>' +
    '</div>' +
    '<div id="contactSuccess" class="form-success" style="display:none">' +
    '<div class="check-icon">&#x2713;</div>' +
    '<h3>Message Sent!</h3>' +
    '<p>Thanks for reaching out. We\'ll get back to you within one business day.</p>' +
    '</div>' +
    '</div>' +
    '</div>';

  // Inject modal into body
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  // Wire up form submission
  var formEl = document.getElementById('contactFormEl');
  if (formEl) {
    formEl.addEventListener('submit', function(e) {
      e.preventDefault();
      handleFormSubmit(e);
    });
  }

  // Wire up ALL links that should open the contact form
  var allLinks = document.querySelectorAll('a');
  allLinks.forEach(function(link) {
    var href = link.getAttribute('href');
    if (!href) return;

    // Match local CTA anchors. Primary conversion stays on futurmix.one.
    if (href === '#contact' ||
        href.indexOf('mailto:hello@futurmix.one') === 0) {
      link.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        openContactModal();
        return false;
      };
    }
  });

  // Close on overlay click
  document.getElementById('contactModal').addEventListener('click', function(e) {
    if (e.target === this) closeContactModal();
  });

  // Close on Escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeContactModal();
  });
})();

function openContactModal() {
  var modal = document.getElementById('contactModal');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  // Reset form state
  document.getElementById('contactFormContent').style.display = 'block';
  document.getElementById('contactSuccess').style.display = 'none';
  var form = document.getElementById('contactFormEl');
  if (form) form.reset();
}

function closeContactModal() {
  var modal = document.getElementById('contactModal');
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

function handleFormSubmit(e) {
  var form = e.target;
  var data = new FormData(form);
  var submitBtn = form.querySelector('.form-submit');
  if (submitBtn) {
    submitBtn.textContent = 'Sending...';
    submitBtn.disabled = true;
  }

  fetch(form.action, {
    method: 'POST',
    body: data,
    headers: { 'Accept': 'application/json' }
  }).then(function(response) {
    if (response.ok) {
      document.getElementById('contactFormContent').style.display = 'none';
      document.getElementById('contactSuccess').style.display = 'block';
      setTimeout(function() { closeContactModal(); }, 3000);
    } else {
      alert('Something went wrong. Please try again or email hello@futurmix.one directly.');
      if (submitBtn) { submitBtn.textContent = 'Send Message'; submitBtn.disabled = false; }
    }
  }).catch(function() {
    alert('Network error. Please try again or email hello@futurmix.one directly.');
    if (submitBtn) { submitBtn.textContent = 'Send Message'; submitBtn.disabled = false; }
  });
}
