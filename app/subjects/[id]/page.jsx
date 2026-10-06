import {notFound} from 'next/navigation';
import {readEntry,readDiscovery} from '../../../lib/discovery.mjs';
import {pageMetadata} from '../../../lib/seo.mjs';
import {DiscoveryFrame,EntryList,BreadcrumbData} from '../../../components/Discovery';
export async function generateMetadata({params}){const {id}=await params,entry=await readEntry('subjects',id);return entry?pageMetadata(entry.name+' | EIA Platform',`محتوى مادة ${entry.name} للعام ${entry.academicYear} وروابط المحاضرات والملخصات المنشورة.`,`/subjects/${id}`):{title:'المادة غير متاحة',robots:{index:false}};}
export default async function Page({params}){const {id}=await params,entry=await readEntry('subjects',id);if(!entry)notFound();const data=await readDiscovery(id);return <DiscoveryFrame title={entry.name} description={`العام ${entry.academicYear} · الفرقة ${entry.year} · الفصل ${entry.term}`}><BreadcrumbData title={entry.name} path={`/subjects/${id}`}/>{entry.lecturer&&<p>المحاضر: {entry.lecturer}</p>}<EntryList items={data.resources} type="resources"/></DiscoveryFrame>;}
