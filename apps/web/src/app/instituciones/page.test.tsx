import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, type AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, { NEXT_PUBLIC_SERVER_URL: "http://localhost:3000" });
});

import { httpClient } from "@/lib/http-client";

import InstitutionsPage from "./page";

// The API at the HTTP boundary: it records what the page sends and answers like the server.
let sent: { method?: string; url?: string; body: unknown }[];
let reply: { status: number; data: unknown };

beforeEach(() => {
  sent = [];
  reply = { status: 201, data: { message: "¡Gracias! Te escribiremos para coordinar." } };
  httpClient.defaults.adapter = async (config) => {
    sent.push({ method: config.method, url: config.url, body: JSON.parse(String(config.data)) });
    const response = {
      data: reply.data,
      status: reply.status,
      statusText: "",
      headers: {},
      config,
    } as AxiosResponse;
    if (reply.status >= 400) {
      throw new AxiosError("Request failed", "ERR_BAD_REQUEST", config, null, response);
    }
    return response;
  };
});

// Fills and sends the institutional form as a person would.
async function askForPilot() {
  render(<InstitutionsPage />);
  const form = screen.getByRole("form", { name: "Pide un piloto de 4 semanas" });
  await askForPilotIn(form);
  return form;
}

async function askForPilotIn(form: HTMLElement) {
  const user = userEvent.setup();
  await user.type(within(form).getByLabelText("Institución"), "Empresa Beta S.A.C.");
  await user.type(within(form).getByLabelText("Tu rol"), "Jefa de bienestar");
  await user.type(within(form).getByLabelText("Personas que van presencialmente a la sede"), "180");
  await user.click(within(form).getByRole("radio", { name: "Sí" }));
  await user.type(within(form).getByLabelText("Correo de contacto"), "bienestar@empresabeta.pe");
  await user.click(within(form).getByRole("checkbox"));
  await user.click(within(form).getByRole("button", { name: "Enviar" }));
}

describe("institutions page (US-033)", () => {
  it("lets someone from an institution ask for a 4-week pilot and thanks them", async () => {
    const form = await askForPilot();

    expect(
      await within(form).findByText("¡Gracias! Te escribiremos para coordinar."),
    ).toBeInTheDocument();
    expect(sent).toEqual([
      {
        method: "post",
        url: "/public/waitlist",
        body: {
          kind: "institution",
          institution: "Empresa Beta S.A.C.",
          role: "Jefa de bienestar",
          onSiteCount: 180,
          wantsPilot: true,
          email: "bienestar@empresabeta.pe",
          consent: true,
          website: "",
        },
      },
    ]);
  });

  it("tells an institution already on the list", async () => {
    reply = {
      status: 409,
      data: { success: false, status: 409, error: "Ya estás en la lista." },
    };

    const form = await askForPilot();

    expect(await within(form).findByText("Ya estás en la lista.")).toBeInTheDocument();
  });

  it("hides the bot trap from people and passes on whatever a bot typed in it", async () => {
    render(<InstitutionsPage />);
    expect(screen.queryByRole("textbox", { name: "Sitio web" })).toBeNull();
    const form = screen.getByRole("form", { name: "Pide un piloto de 4 semanas" });
    const trap = form.querySelector<HTMLInputElement>('input[name="website"]')!;
    fireEvent.change(trap, { target: { value: "https://ofertas.example" } });
    await askForPilotIn(form);

    await within(form).findByRole("status");
    expect(sent[0]?.body).toMatchObject({ website: "https://ofertas.example" });
  });

  it("asks whether they want the pilot before sending", async () => {
    const user = userEvent.setup();
    render(<InstitutionsPage />);
    const form = screen.getByRole("form", { name: "Pide un piloto de 4 semanas" });

    await user.type(within(form).getByLabelText("Institución"), "Empresa Beta S.A.C.");
    await user.type(within(form).getByLabelText("Tu rol"), "Jefa de bienestar");
    await user.type(
      within(form).getByLabelText("Personas que van presencialmente a la sede"),
      "180",
    );
    await user.type(within(form).getByLabelText("Correo de contacto"), "bienestar@empresabeta.pe");
    await user.click(within(form).getByRole("checkbox"));
    await user.click(within(form).getByRole("button", { name: "Enviar" }));

    expect(await within(form).findByText("Elige Sí o No.")).toBeInTheDocument();
    expect(sent).toEqual([]);
  });

  it("catches a head count above what the server accepts before sending", async () => {
    const user = userEvent.setup();
    render(<InstitutionsPage />);
    const form = screen.getByRole("form", { name: "Pide un piloto de 4 semanas" });
    const headCount = within(form).getByLabelText("Personas que van presencialmente a la sede");

    await user.type(headCount, "100001");
    await user.click(within(form).getByRole("button", { name: "Enviar" }));

    expect(
      await within(form).findByText("Escribe un número de hasta 100 000 personas."),
    ).toBeInTheDocument();
    expect(sent).toEqual([]);
  });

  it("sends nothing until the person accepts how their data is used", async () => {
    const user = userEvent.setup();
    render(<InstitutionsPage />);
    const form = screen.getByRole("form", { name: "Avísame cuando mi empresa esté" });

    await user.type(within(form).getByLabelText("Correo"), "ana@empresabeta.pe");
    await user.type(within(form).getByLabelText("Institución"), "Empresa Beta S.A.C.");
    await user.click(within(form).getByRole("button", { name: "Avísame" }));

    expect(
      await within(form).findByText("Acepta el uso de tus datos para continuar."),
    ).toBeInTheDocument();
    expect(sent).toEqual([]);
  });
});

// Fills and sends the individual form as a person would.
async function askToBeTold() {
  const user = userEvent.setup();
  render(<InstitutionsPage />);
  const form = screen.getByRole("form", { name: "Avísame cuando mi empresa esté" });

  await user.type(within(form).getByLabelText("Correo"), "ana@empresabeta.pe");
  await user.type(within(form).getByLabelText("Institución"), "Empresa Beta S.A.C.");
  await user.click(within(form).getByRole("checkbox"));
  await user.click(within(form).getByRole("button", { name: "Avísame" }));
  return form;
}

describe("individual sign-up on the institutions page (US-033)", () => {
  it("lets a person ask to be told when their company joins", async () => {
    const form = await askToBeTold();

    expect(
      await within(form).findByText("¡Gracias! Te escribiremos para coordinar."),
    ).toBeInTheDocument();
    expect(sent).toEqual([
      {
        method: "post",
        url: "/public/waitlist",
        body: {
          kind: "individual",
          institution: "Empresa Beta S.A.C.",
          email: "ana@empresabeta.pe",
          consent: true,
          website: "",
        },
      },
    ]);
  });

  it("asks a person who sent too many entries to wait", async () => {
    reply = {
      status: 429,
      data: { success: false, status: 429, error: "Inténtalo en unos minutos." },
    };

    const form = await askToBeTold();

    expect(await within(form).findByText("Inténtalo en unos minutos.")).toBeInTheDocument();
  });
});
