import {
  applyParamsToScript,
  Blockfrost,
  Data,
  Lucid,
  MintingPolicy,
  PolicyId,
  TxHash,
  Unit,
  utf8ToHex,
} from "../mod.ts";

const lucid = await Lucid.new(
  new Blockfrost("https://cardano-preview.blockfrost.io/api/v0", "<projectId>"),
  "Preview",
);

const api = await window.cardano.nami.enable();
// Assumes you are in a browser environment
lucid.selectWallet(api);

const mintingPolicy: MintingPolicy = {
  type: "PlutusV2",
  script: applyParamsToScript(
    "5907945907910100003233223232323232323232323232323322323232323222232325335332232333573466e1c005201401d01c375a00e6666ae68cdc39aab9d37540089000100c11931900c19ab9c0190180163333573466e1cd55cea80124000466442466002006004646464646464646464646464646666ae68cdc39aab9d500c480008cccccccccccc88888888888848cccccccccccc00403403002c02802402001c01801401000c008cd4054058d5d0a80619a80a80b1aba1500b33501501735742a014666aa032eb94060d5d0a804999aa80cbae501835742a01066a02a0406ae85401cccd54064085d69aba150063232323333573466e1cd55cea801240004664424660020060046464646666ae68cdc39aab9d5002480008cc8848cc00400c008cd40add69aba15002302c357426ae8940088c98c80b8cd5ce01781701609aab9e5001137540026ae854008c8c8c8cccd5cd19b8735573aa004900011991091980080180119a815bad35742a00460586ae84d5d1280111931901719ab9c02f02e02c135573ca00226ea8004d5d09aba2500223263202a33573805605405026aae7940044dd50009aba1500533501575c6ae854010ccd540640748004d5d0a801999aa80cbae200135742a004603e6ae84d5d1280111931901319ab9c027026024135744a00226ae8940044d5d1280089aba25001135744a00226ae8940044d5d1280089aba25001135744a00226ae8940044d55cf280089baa00135742a004601e6ae84d5d1280111931900c19ab9c01901801610171326320173357389210350543500017135573ca00226ea800448c88c008dd6000990009aa80b111999aab9f0012500a233500930043574200460066ae880080508c8c8cccd5cd19b8735573aa004900011991091980080180118061aba150023005357426ae8940088c98c8050cd5ce00a80a00909aab9e5001137540024646464646666ae68cdc39aab9d5004480008cccc888848cccc00401401000c008c8c8c8cccd5cd19b8735573aa0049000119910919800801801180a9aba1500233500f014357426ae8940088c98c8064cd5ce00d00c80b89aab9e5001137540026ae854010ccd54021d728039aba150033232323333573466e1d4005200423212223002004357426aae79400c8cccd5cd19b875002480088c84888c004010dd71aba135573ca00846666ae68cdc3a801a400042444006464c6403666ae7007006c06406005c4d55cea80089baa00135742a00466a016eb8d5d09aba2500223263201533573802c02a02626ae8940044d5d1280089aab9e500113754002266aa002eb9d6889119118011bab00132001355013223233335573e0044a010466a00e66442466002006004600c6aae754008c014d55cf280118021aba200301213574200222440042442446600200800624464646666ae68cdc3a800a40004642446004006600a6ae84d55cf280191999ab9a3370ea0049001109100091931900819ab9c01101000e00d135573aa00226ea80048c8c8cccd5cd19b875001480188c848888c010014c01cd5d09aab9e500323333573466e1d400920042321222230020053009357426aae7940108cccd5cd19b875003480088c848888c004014c01cd5d09aab9e500523333573466e1d40112000232122223003005375c6ae84d55cf280311931900819ab9c01101000e00d00c00b135573aa00226ea80048c8c8cccd5cd19b8735573aa004900011991091980080180118029aba15002375a6ae84d5d1280111931900619ab9c00d00c00a135573ca00226ea80048c8cccd5cd19b8735573aa002900011bae357426aae7940088c98c8028cd5ce00580500409baa001232323232323333573466e1d4005200c21222222200323333573466e1d4009200a21222222200423333573466e1d400d2008233221222222233001009008375c6ae854014dd69aba135744a00a46666ae68cdc3a8022400c4664424444444660040120106eb8d5d0a8039bae357426ae89401c8cccd5cd19b875005480108cc8848888888cc018024020c030d5d0a8049bae357426ae8940248cccd5cd19b875006480088c848888888c01c020c034d5d09aab9e500b23333573466e1d401d2000232122222223005008300e357426aae7940308c98c804ccd5ce00a00980880800780700680600589aab9d5004135573ca00626aae7940084d55cf280089baa0012323232323333573466e1d400520022333222122333001005004003375a6ae854010dd69aba15003375a6ae84d5d1280191999ab9a3370ea0049000119091180100198041aba135573ca00c464c6401866ae700340300280244d55cea80189aba25001135573ca00226ea80048c8c8cccd5cd19b875001480088c8488c00400cdd71aba135573ca00646666ae68cdc3a8012400046424460040066eb8d5d09aab9e500423263200933573801401200e00c26aae7540044dd500089119191999ab9a3370ea00290021091100091999ab9a3370ea00490011190911180180218031aba135573ca00846666ae68cdc3a801a400042444004464c6401466ae7002c02802001c0184d55cea80089baa0012323333573466e1d40052002200823333573466e1d40092000200823263200633573800e00c00800626aae74dd5000a4c240029210350543100122002122001112323001001223300330020020011",
    10n,
  ),
};

const policyId: PolicyId = lucid.utils.mintingPolicyToId(
  mintingPolicy,
);

export async function mint(
  name: string,
): Promise<TxHash> {
  const unit: Unit = policyId + utf8ToHex(name);

  const tx = await lucid
    .newTx()
    .mintAssets({ [unit]: 1n }, Data.empty())
    .attachMintingPolicy(mintingPolicy)
    .complete();

  const signedTx = await tx.sign().complete();

  const txHash = await signedTx.submit();

  return txHash;
}
