// Login, criação de conta e recuperação de senha com o Supabase Auth

const formLogin = document.getElementById("form-login");
const campoNome = document.getElementById("campo-nome");
const campoSenha = document.getElementById("campo-senha");
const linkEsqueci = document.getElementById("link-esqueci");
const botaoEnviar = document.getElementById("botao-enviar");
const trocaModo = document.getElementById("troca-modo");
const tituloPainel = document.getElementById("titulo-painel");
const mensagem = document.getElementById("mensagem-erro");

// Textos de cada modo da tela
const MODOS = {
  entrar: {
    titulo: "Bem-vindo",
    botao: "ENTRAR",
    troca: 'Não tem conta? <a href="#" data-modo="criar">Criar conta</a>'
  },
  criar: {
    titulo: "Criar conta",
    botao: "CRIAR CONTA",
    troca: 'Já tem conta? <a href="#" data-modo="entrar">Entrar</a>'
  },
  recuperar: {
    titulo: "Recuperar senha",
    botao: "ENVIAR LINK",
    troca: '<a href="#" data-modo="entrar">Voltar para o login</a>'
  }
};

let modoAtual = "entrar";

function mudarModo(modo) {
  modoAtual = modo;
  const textos = MODOS[modo];

  tituloPainel.textContent = textos.titulo;
  botaoEnviar.textContent = textos.botao;
  trocaModo.innerHTML = textos.troca;

  campoNome.hidden = modo !== "criar";
  campoSenha.hidden = modo === "recuperar";
  linkEsqueci.hidden = modo !== "entrar";
  document.getElementById("senha").autocomplete = modo === "criar" ? "new-password" : "current-password";

  mostrarMensagem("");
}

function mostrarMensagem(texto, tipo = "erro") {
  mensagem.textContent = texto;
  mensagem.className = tipo === "sucesso" ? "erro sucesso" : "erro";
}

// Links que trocam de modo (Criar conta, Entrar, Esqueceu a senha...)
document.addEventListener("click", function (evento) {
  const link = evento.target.closest("[data-modo]");
  if (!link) return;
  evento.preventDefault();
  mudarModo(link.dataset.modo);
});

// Traduz os erros mais comuns do Supabase (pelo código do erro e, se não houver, pelo texto)
function traduzirErro(erro) {
  const codigo = (erro && erro.code) || "";
  const texto = (erro && erro.message) || "";

  if (codigo === "over_email_send_rate_limit" || /email rate limit/i.test(texto)) {
    return modoAtual === "recuperar"
      ? "O limite de e-mails do site foi atingido. Tente de novo daqui a uma hora."
      : "Muitos cadastros em pouco tempo: o limite de e-mails do site foi atingido. Tente de novo daqui a uma hora.";
  }
  if (codigo === "over_request_rate_limit" || /rate limit|too many/i.test(texto)) {
    return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  }
  if (codigo === "email_provider_disabled" || /email logins are disabled|signups not allowed/i.test(texto)) {
    return "O login por e-mail está temporariamente desativado. Tente de novo mais tarde.";
  }
  if (codigo === "invalid_credentials" || /invalid login credentials/i.test(texto)) return "E-mail ou senha incorretos.";
  if (codigo === "email_not_confirmed" || /email not confirmed/i.test(texto)) {
    return "Confirme seu e-mail antes de entrar (veja sua caixa de entrada e o spam).";
  }
  if (codigo === "user_already_exists" || /already registered/i.test(texto)) return "Este e-mail já tem conta. Tente entrar.";
  if (codigo === "weak_password" || /at least 6 characters|password should be/i.test(texto)) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }
  if (codigo === "email_address_invalid" || /invalid.*email|email.*invalid/i.test(texto)) return "Digite um e-mail válido.";
  if (/failed to fetch|network/i.test(texto)) return "Sem conexão com o servidor. Verifique sua internet.";
  return texto || "Algo deu errado. Tente novamente.";
}

formLogin.addEventListener("submit", async function (evento) {
  evento.preventDefault(); // impede a página de recarregar

  if (!SUPABASE_CONFIGURADO) {
    mostrarMensagem("Configure o Supabase em js/supabase-config.js.");
    return;
  }

  const nome = document.getElementById("nome").value.trim();
  const email = document.getElementById("email").value.trim();
  const senha = document.getElementById("senha").value;

  if (!email || (modoAtual !== "recuperar" && !senha) || (modoAtual === "criar" && !nome)) {
    mostrarMensagem("Preencha todos os campos.");
    return;
  }

  botaoEnviar.disabled = true;
  mostrarMensagem("");

  try {
    if (modoAtual === "entrar") {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
      window.location.href = "pages/home.html";
    }

    if (modoAtual === "criar") {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password: senha,
        options: {
          data: { nome: nome },
          emailRedirectTo: new URL("pages/home.html", window.location.href).href
        }
      });
      if (error) throw error;

      // Quando o e-mail já tem conta, o Supabase responde "sucesso" mas sem identidades
      // (é proposital, para não revelar quem tem conta). Aqui avisamos de forma amigável.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        mudarModo("entrar");
        document.getElementById("email").value = email;
        mostrarMensagem("Este e-mail já tem conta. Entre com sua senha ou use \"Esqueceu a senha?\".");
        return;
      }

      if (data.session) {
        // Confirmação de e-mail desligada no Supabase: já entra direto
        window.location.href = "pages/home.html";
      } else {
        mudarModo("entrar");
        mostrarMensagem("Conta criada! Enviamos um link de confirmação para " + email + ".", "sucesso");
      }
    }

    if (modoAtual === "recuperar") {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: new URL("pages/nova-senha.html", window.location.href).href
      });
      if (error) throw error;
      mostrarMensagem("Se esse e-mail tiver conta, você vai receber um link para criar uma nova senha.", "sucesso");
    }
  } catch (erro) {
    mostrarMensagem(traduzirErro(erro));
  } finally {
    botaoEnviar.disabled = false;
  }
});

// Se já estiver logado, vai direto para a home
async function verificarSessao() {
  if (!SUPABASE_CONFIGURADO) {
    mostrarMensagem("Configure o Supabase em js/supabase-config.js.");
    return;
  }
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) window.location.href = "pages/home.html";
}

mudarModo("entrar");
verificarSessao();
