// Contact Form Modal — FuturMix
(function() {
  // Create modal HTML
  var modalHTML = '<div class="modal-overlay" id="contactModal">' +
    '<div class="modal">' +
    '<button class="modal-close" onclick="closeContactModal()">&times;</button>' +
    '<div id="contactForm">' +
    '<h2>Get in Touch</h2>' +
    '<p class="modal-subtitle">Tell us about your team and what you\'re looking to build. We\'ll get back to you within one business day.</p>' +
    '<form action="https://formsubmit.co/admin@futurmix.ai" method="POST" onsubmit="handleFormSubmit(event)">' +
    '<input type="hidden" name="_subject" value="FuturMix.one Lead Inquiry">' +
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
    '<option value="strategy">Strategy & Analysis Agents</option>' +
    '<option value="content">Content Production Agents</option>' +
    '<option value="code">Code & Engineering Agents</option>' +
    '<option value="research">Research & Due Diligence Agents</option>' +
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

  // Wire up all CTA buttons to open modal instead of external links
  var ctaSelectors = [
    'a[href="mailto:admin@futurmix.ai"]',
    'a.btn-primary[href="https://futurmix.ai"]',
    'a.btn-secondary[href="https://futurmix.ai"]',
    'a.nav-cta[href="https://futurmix.ai"]'
  ];
  document.querySelectorAll(ctaSelectors.join(',')).forEach(function(link) {
    link.href = '#contact';
    link.addEventListener('click', function(e) {
      e.preventDefault();
      openContactModal();
    });
  });

  // Also wire up footer "Start Agent" links
  document.querySelectorAll('.footer-col a[href="https://futurmix.ai"]').forEach(function(link) {
    link.href = '#contact';
    link.addEventListener('click', function(e) {
      e.preventDefault();
      openContactModal();
    });
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
  document.getElementById('contactModal').classList.add('active');
  document.body.style.overflow = 'hidden';
  // Reset form state
  document.getElementById('contactForm').style.display = 'block';
  document.getElementById('contactSuccess').style.display = 'none';
  var form = document.querySelector('#contactForm form');
  if (form) form.reset();
}

function closeContactModal() {
  document.getElementById('contactModal').classList.remove('active');
  document.body.style.overflow = '';
}

function handleFormSubmit(e) {
  e.preventDefault();
  var form = e.target;
  var data = new FormData(form);

  fetch(form.action, {
    method: 'POST',
    body: data,
    headers: { 'Accept': 'application/json' }
  }).then(function(response) {
    if (response.ok) {
      document.getElementById('contactForm').style.display = 'none';
      document.getElementById('contactSuccess').style.display = 'block';
      setTimeout(function() { closeContactModal(); }, 3000);
    } else {
      alert('Something went wrong. Please try again or email admin@futurmix.ai directly.');
    }
  }).catch(function() {
    alert('Network error. Please try again or email admin@futurmix.ai directly.');
  });
}
